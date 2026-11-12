import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatTgPhone, formatXof } from '@streetwear/shared';
import { Button } from '../../components/button';
import { errorClass, inputClass, labelClass } from '../../components/form-classes';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { ApiRequestError, errorMessage } from '../../lib/errors';
import {
  completeDelivery,
  failDelivery,
  listCourierDeliveries,
  startDelivery,
  type CourierDelivery,
  type DeliveryStatus,
} from '../../lib/logistics-api';
import { DeliveryStatusBadge } from '../deliveries/deliveries-page';

const FAIL_REASONS = ['absent', 'refused', 'unreachable', 'other'] as const;
type FailReason = (typeof FAIL_REASONS)[number];

export const mapsUrl = (lat: number, lng: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function completeError(e: unknown): string {
  if (e instanceof ApiRequestError && e.code === 'HANDOVER_CODE_INVALID') {
    const left = (e.details as { remainingAttempts?: number } | undefined)?.remainingAttempts;
    return typeof left === 'number'
      ? fr[left > 1 ? 'courier.code.invalidMany' : 'courier.code.invalidOne'].replace(
          '{n}',
          String(left),
        )
      : fr['error.HANDOVER_CODE_INVALID'];
  }
  return errorMessage(e);
}

function CompleteForm({ d, onDone }: { d: CourierDelivery; onDone: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cod = d.codBalanceXof !== null;
  const codeOk = /^\d{6}$/.test(code);
  const amountOk = !cod || (amount !== '' && /^\d+$/.test(amount));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!codeOk || !amountOk) {
      setError(fr[codeOk ? 'courier.amount.required' : 'courier.code.format']);
      return;
    }
    const body = { handoverCode: code, ...(cod && { codCollectedXof: Number(amount) }) };
    setCode('');
    setAmount('');
    setBusy(true);
    setError(null);
    try {
      await completeDelivery(d.id, body);
      toast.show(fr['courier.completed'], 'success');
      onDone();
    } catch (err) {
      setError(completeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="mt-3 grid gap-3">
      <label className={labelClass}>
        {fr['courier.code']}
        <input
          className={`${inputClass} min-h-11 font-mono text-lg tracking-widest`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <span className="font-normal">{fr['courier.code.hint']}</span>
      </label>
      {cod && (
        <label className={labelClass}>
          {fr['courier.amount']}
          <input
            className={`${inputClass} min-h-11 font-mono`}
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          />
          <span className="font-normal">
            {fr['courier.amount.hint'].replace('{amount}', formatXof(d.codBalanceXof ?? 0))}
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className={`${errorClass} text-sm`}>
          {error}
        </p>
      )}
      <Button type="submit" className="min-h-11 w-full" disabled={busy}>
        {fr['courier.complete']}
      </Button>
    </form>
  );
}

function FailForm({ d, onDone }: { d: CourierDelivery; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<FailReason>('absent');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason === 'other' && !note.trim()) {
      setError(fr['courier.fail.noteRequired']);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await failDelivery(d.id, { reason, ...(note.trim() && { note: note.trim() }) });
      toast.show(fr['courier.failed'], 'success');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="mt-3 grid gap-3">
      <label className={labelClass}>
        {fr['courier.fail.reason']}
        <select
          className={`${inputClass} min-h-11`}
          value={reason}
          onChange={(e) => setReason(e.target.value as FailReason)}
        >
          {FAIL_REASONS.map((r) => (
            <option key={r} value={r}>
              {fr[`courier.fail.${r}`]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {fr['courier.fail.note']}
        <textarea
          rows={3}
          maxLength={500}
          className={`${inputClass} py-2`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className={`${errorClass} text-sm`}>
          {error}
        </p>
      )}
      <Button type="submit" variant="danger" className="min-h-11 w-full" disabled={busy}>
        {fr['courier.fail.confirm']}
      </Button>
    </form>
  );
}

function DeliveryCard({ d, onChanged }: { d: CourierDelivery; onChanged: () => void }) {
  const toast = useToast();
  const status = d.status as DeliveryStatus;
  const [failing, setFailing] = useState(false);
  const [starting, setStarting] = useState(false);
  const a = d.address;

  const start = async () => {
    setStarting(true);
    try {
      await startDelivery(d.id);
      onChanged();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setStarting(false);
    }
  };
  const linkClass =
    'inline-flex min-h-11 items-center justify-center rounded-admin border border-borderStrong bg-surface px-4 text-sm font-medium text-ink hover:bg-surfaceMuted';

  return (
    <li
      aria-label={`${fr['courier.run']} ${d.orderNumber}`}
      className="rounded-admin-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-mono text-base font-semibold">{d.orderNumber}</h2>
        <DeliveryStatusBadge status={status} />
      </div>
      <p className="mt-2 text-sm font-medium">{d.customerName}</p>
      <p className="mt-1 text-sm">
        {a.district} — {a.landmark}
      </p>
      <p className="mt-1 text-xs text-inkSecondary">
        {fr['courier.items'].replace('{n}', String(d.itemsCount))}
      </p>
      {d.codBalanceXof !== null && (
        <p className="mt-2 text-sm">
          {fr['courier.cod']}{' '}
          <span className="font-mono font-semibold">{formatXof(d.codBalanceXof)}</span>
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          className={linkClass}
          href={mapsUrl(a.lat, a.lng)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${fr['courier.route']} ${d.orderNumber}`}
        >
          {fr['courier.route']}
        </a>
        <a
          className={linkClass}
          href={`tel:${d.customerPhone}`}
          aria-label={`${fr['courier.call']} ${formatTgPhone(d.customerPhone)}`}
        >
          {fr['courier.call']}
        </a>
      </div>
      {status === 'assigned' && (
        <Button className="mt-3 min-h-11 w-full" disabled={starting} onClick={() => void start()}>
          {fr['courier.start']}
        </Button>
      )}
      {status === 'in_progress' && <CompleteForm d={d} onDone={onChanged} />}
      {(status === 'assigned' || status === 'in_progress') && (
        <>
          <Button
            variant="secondary"
            className="mt-3 min-h-11 w-full"
            aria-expanded={failing}
            onClick={() => setFailing((v) => !v)}
          >
            {fr['courier.fail']}
          </Button>
          {failing && <FailForm d={d} onDone={onChanged} />}
        </>
      )}
    </li>
  );
}

export function CourierPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['courier-deliveries'], queryFn: () => listCourierDeliveries() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['courier-deliveries'] });
  const rows = q.data ?? [];
  return (
    <section className="mx-auto max-w-xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{fr['courier.title']}</h1>
        <Button variant="secondary" onClick={refresh} disabled={q.isFetching}>
          {fr['courier.refresh']}
        </Button>
      </div>
      {q.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage(q.error)}
        </p>
      )}
      {q.isPending && <p className="mt-3 text-sm text-inkSecondary">{fr['app.loading']}</p>}
      {q.data && rows.length === 0 && (
        <p className="mt-3 text-sm text-inkSecondary">{fr['courier.empty']}</p>
      )}
      <ul className="mt-4 grid gap-3" aria-label={fr['courier.list']}>
        {rows.map((d) => (
          <DeliveryCard key={d.id} d={d} onChanged={refresh} />
        ))}
      </ul>
    </section>
  );
}
