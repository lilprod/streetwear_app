import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { allowedTransitions, unmetPreconditions, type OrderStatus } from '@streetwear/shared';
import { useAuth } from '../../auth/auth-context';
import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { assignOperator, transitionOrder, type AdminOrder } from '../../lib/orders-api';

type Pending = { to: OrderStatus; kind: 'assign' | 'cancel' | 'code' | 'direct' };

export const useOrderCacheUpdate = () => {
  const qc = useQueryClient();
  return (order: AdminOrder) => {
    qc.setQueryData(['order', order.id], order);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['production-queue'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
};

const kindOf = (from: OrderStatus, to: OrderStatus): Exclude<Pending['kind'], 'direct'> | null => {
  if (to === 'cancelled') return 'cancel';
  const unmet = unmetPreconditions(from, to, {});
  if (unmet.includes('requiresOperator')) return 'assign';
  if (unmet.includes('requiresHandoverCode')) return 'code';
  return null;
};

export function TransitionPanel({ order }: { order: AdminOrder }) {
  const { role, session } = useAuth();
  const toast = useToast();
  const update = useOrderCacheUpdate();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const fieldId = useId();

  const targets = role
    ? allowedTransitions(
        order.status,
        { type: 'admin', role },
        { receptionType: order.receptionType },
      )
    : [];

  const close = () => {
    setPending(null);
    setNote('');
    setCode('');
    setCodeError(false);
  };

  const mutation = useMutation({
    mutationFn: (p: Pending) => {
      if (p.kind === 'assign') return assignOperator(order.id, session?.userId ?? '');
      return transitionOrder(order.id, {
        to: p.to,
        ...(p.kind === 'cancel' && note.trim() ? { note: note.trim() } : {}),
        ...(p.kind === 'code' ? { code } : {}),
      });
    },
    onSuccess: (updated) => {
      update(updated);
      toast.show(fr['order.transitioned'], 'success');
      close();
    },
    onError: (e) => {
      toast.show(errorMessage(e), 'error');
      close();
    },
  });

  const start = (to: OrderStatus) => {
    const kind = kindOf(order.status, to);
    if (kind) setPending({ to, kind });
    else mutation.mutate({ to, kind: 'direct' });
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'code') {
      const facts = { requiresHandoverCode: /^\d{6}$/.test(code) };
      if (unmetPreconditions(order.status, pending.to, facts).includes('requiresHandoverCode')) {
        setCodeError(true);
        return;
      }
    }
    mutation.mutate(pending);
  };

  const dialogTitle =
    pending?.kind === 'cancel'
      ? fr['order.cancel.title']
      : pending?.kind === 'assign'
        ? fr['order.assign.title']
        : fr['order.code.title'];

  return (
    <section
      aria-labelledby={`${fieldId}-t`}
      className="rounded-admin-lg border border-border bg-surface p-4"
    >
      <h2 id={`${fieldId}-t`} className="text-lg font-semibold">
        {fr['order.actions']}
      </h2>
      {targets.length === 0 ? (
        <p className="mt-2 text-sm text-inkSecondary">{fr['order.actions.none']}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {targets.map((to) => (
            <li key={to}>
              <Button
                variant={to === 'cancelled' ? 'danger' : 'primary'}
                disabled={mutation.isPending}
                onClick={() => start(to)}
              >
                {fr[`order.action.${to}` as FrKey]}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!pending}
        title={dialogTitle}
        destructive={pending?.kind === 'cancel'}
        confirmLabel={
          pending?.kind === 'cancel'
            ? fr['order.cancel.confirm']
            : pending?.kind === 'assign'
              ? fr['order.assign.confirm']
              : fr['order.code.confirm']
        }
        cancelLabel={pending?.kind === 'cancel' ? fr['order.cancel.keep'] : undefined}
        onConfirm={confirm}
        onCancel={close}
      >
        {pending?.kind === 'cancel' && (
          <>
            <p>{fr['order.cancel.body']}</p>
            <label htmlFor={`${fieldId}-n`} className="mt-3 block text-xs font-medium">
              {fr['order.cancel.note']}
            </label>
            <textarea
              id={`${fieldId}-n`}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-admin border border-borderStrong bg-surface p-2 text-sm text-ink"
            />
          </>
        )}
        {pending?.kind === 'assign' && <p>{fr['order.assign.body']}</p>}
        {pending?.kind === 'code' && (
          <>
            <p>{fr['order.code.body']}</p>
            <label htmlFor={`${fieldId}-c`} className="mt-3 block text-xs font-medium">
              {fr['order.code.label']}
            </label>
            <input
              id={`${fieldId}-c`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={code}
              aria-invalid={codeError}
              aria-describedby={codeError ? `${fieldId}-e` : undefined}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="mt-1 min-h-10 w-full rounded-admin border border-borderStrong bg-surface px-3 font-mono text-sm text-ink"
            />
            {codeError && (
              <p id={`${fieldId}-e`} role="alert" className="mt-1 text-xs text-danger">
                {fr['order.code.invalid']}
              </p>
            )}
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
