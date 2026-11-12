import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ADMIN_ROLES, type AdminRole } from '@streetwear/shared';
import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { DataTable } from '../../components/data-table';
import { Badge, CheckField, SelectField, TextField } from '../../components/field';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { useCursorStack } from '../../lib/paging';
import {
  createAccount,
  listAccounts,
  updateAccount,
  type AdminAccount,
  type AccountPatch,
} from '../../lib/team-api';
import { useAuth } from '../../auth/auth-context';

const PHONE = /^\+228\d{8}$/;
const MIN_PASSWORD = 12;
const col = createColumnHelper<AdminAccount>();

export const roleLabel = (r: AdminRole): string => fr[`team.role.${r}` as FrKey];

type FormState = {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
  phone: string;
  active: boolean;
  resetTotp: boolean;
};

const emptyForm = (): FormState => ({
  email: '',
  name: '',
  password: '',
  role: 'order_manager',
  phone: '',
  active: true,
  resetTotp: false,
});

export function AccountsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useAuth();
  const selfId = session?.userId;
  const pager = useCursorStack();
  const list = useQuery({
    queryKey: ['team', 'accounts', pager.cursor ?? null],
    queryFn: ({ signal }) => listAccounts(pager.cursor, signal),
  });
  const [mode, setMode] = useState<'closed' | 'create' | AdminAccount>('closed');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toToggle, setToToggle] = useState<AdminAccount | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['team', 'accounts'] });
  const onError = (err: unknown) => toast.show(errorMessage(err), 'error');

  const save = useMutation({
    mutationFn: () => {
      if (mode === 'create') {
        return createAccount({
          email: form.email.trim(),
          name: form.name.trim() || undefined,
          password: form.password,
          role: form.role,
          ...(form.role === 'courier' ? { phone: form.phone.trim() } : {}),
        });
      }
      if (typeof mode === 'string') throw new Error('mode');
      const body: AccountPatch = {
        name: form.name.trim() || null,
        role: form.role,
        resetTotp: form.resetTotp ? true : undefined,
        ...(form.password ? { password: form.password } : {}),
        ...(form.role === 'courier' && form.phone ? { phone: form.phone.trim() } : {}),
      };
      return updateAccount(mode.id, body);
    },
    onSuccess: () => {
      toast.show(fr['team.saved']);
      setMode('closed');
      invalidate();
    },
    onError,
  });

  const toggle = useMutation({
    mutationFn: (a: AdminAccount) => updateAccount(a.id, { active: !a.active }),
    onSuccess: (a) => {
      toast.show(a.active ? fr['team.reactivated'] : fr['team.deactivated']);
      setToToggle(null);
      invalidate();
    },
    onError: (err) => {
      setToToggle(null);
      onError(err);
    },
  });

  const open = (m: 'create' | AdminAccount) => {
    setErrors({});
    setMode(m);
    setForm(
      m === 'create'
        ? emptyForm()
        : {
            email: m.email,
            name: m.name ?? '',
            password: '',
            role: m.role,
            phone: '',
            active: m.active,
            resetTotp: false,
          },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (mode === 'create') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
        next.email = fr['team.form.emailFormat'];
      if (form.password.length < MIN_PASSWORD) next.password = fr['team.form.passwordFormat'];
    } else if (form.password && form.password.length < MIN_PASSWORD) {
      next.password = fr['team.form.passwordFormat'];
    }
    if (form.role === 'courier' && !PHONE.test(form.phone.trim())) {
      next.phone = fr['team.form.phoneFormat'];
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };

  const columns = [
    col.accessor('email', {
      header: fr['team.col.account'],
      cell: (c) => (
        <div>
          <div className="font-medium">{c.row.original.name ?? c.getValue()}</div>
          <div className="text-xs text-inkSecondary">{c.getValue()}</div>
        </div>
      ),
    }),
    col.accessor('role', {
      header: fr['team.col.role'],
      cell: (c) => roleLabel(c.getValue()),
    }),
    col.accessor('totpEnabled', {
      header: fr['team.col.totp'],
      cell: (c) => (c.getValue() ? fr['team.totp.enrolled'] : fr['team.totp.pending']),
    }),
    col.accessor('active', {
      header: fr['catalog.col.status'],
      cell: (c) => (
        <Badge tone={c.getValue() ? 'on' : 'off'}>
          {c.getValue() ? fr['team.status.active'] : fr['team.status.disabled']}
        </Badge>
      ),
    }),
    col.display({
      id: 'actions',
      header: fr['catalog.col.actions'],
      enableSorting: false,
      cell: (c) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => open(c.row.original)}>
            {fr['catalog.action.edit']}
            <span className="sr-only"> {c.row.original.email}</span>
          </Button>
          <Button
            variant={c.row.original.active ? 'danger' : 'secondary'}
            onClick={() =>
              c.row.original.active ? setToToggle(c.row.original) : toggle.mutate(c.row.original)
            }
          >
            {c.row.original.active ? fr['team.action.disable'] : fr['team.action.enable']}
            <span className="sr-only"> {c.row.original.email}</span>
          </Button>
        </div>
      ),
    }),
  ];

  const isEdit = typeof mode !== 'string';
  return (
    <section aria-labelledby="accounts-title" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="accounts-title" className="text-lg font-semibold">
          {fr['team.accounts.title']}
        </h2>
        <Button onClick={() => open('create')}>{fr['team.account.add']}</Button>
      </div>
      {mode !== 'closed' && (
        <form
          onSubmit={submit}
          noValidate
          aria-label={isEdit ? fr['team.account.edit'] : fr['team.account.new']}
          className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-2"
        >
          <h3 className="text-base font-semibold md:col-span-2">
            {isEdit ? fr['team.account.edit'] : fr['team.account.new']}
          </h3>
          <TextField
            label={fr['team.form.email']}
            type="email"
            autoComplete="off"
            value={form.email}
            disabled={isEdit}
            error={errors.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <TextField
            label={fr['team.form.name']}
            value={form.name}
            maxLength={100}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <SelectField
            label={fr['team.form.role']}
            value={form.role}
            disabled={selfId !== undefined && isEdit && mode.id === selfId}
            onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
          >
            {ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </SelectField>
          {form.role === 'courier' && (
            <TextField
              label={fr['team.form.phone']}
              hint={fr['team.form.phoneHint']}
              inputMode="tel"
              value={form.phone}
              error={errors.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          )}
          <TextField
            label={isEdit ? fr['team.form.newPassword'] : fr['team.form.password']}
            hint={fr['team.form.passwordHint']}
            type="password"
            autoComplete="new-password"
            value={form.password}
            error={errors.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {isEdit && (
            <div className="md:col-span-2">
              <CheckField
                label={fr['team.form.resetTotp']}
                checked={form.resetTotp}
                onChange={(v) => setForm({ ...form, resetTotp: v })}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {isEdit ? fr['catalog.form.save'] : fr['team.account.create']}
            </Button>
            <Button variant="secondary" onClick={() => setMode('closed')}>
              {fr['catalog.form.cancel']}
            </Button>
          </div>
        </form>
      )}
      {list.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      <div className="mt-4">
        <DataTable
          caption={fr['team.accounts.caption']}
          columns={columns}
          data={list.data?.items ?? []}
          getRowId={(r) => r.id}
          {...pager.pagerProps(list.data?.nextCursor)}
        />
      </div>
      <ConfirmDialog
        open={toToggle !== null}
        title={fr['team.confirm.disable.title']}
        confirmLabel={fr['team.action.disable']}
        destructive
        onCancel={() => setToToggle(null)}
        onConfirm={() => toToggle && toggle.mutate(toToggle)}
      >
        <p>{fr['team.confirm.disable.body']}</p>
      </ConfirmDialog>
    </section>
  );
}
