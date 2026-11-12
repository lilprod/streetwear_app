import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/button';
import { CheckField, TextField } from '../../components/field';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { getSettings, patchSettings, type PaymentMethodSetting } from '../../lib/settings-api';
import { TemplatesPanel } from './templates-panel';

const METHODS: PaymentMethodSetting[] = ['tmoney', 'flooz', 'card', 'cod'];

export function SettingsPage() {
  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['settings.title']}</h1>
      <ShopSettingsForm />
      <TemplatesPanel />
    </section>
  );
}

function ShopSettingsForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => getSettings(signal),
  });
  const [deposit, setDeposit] = useState('');
  const [expiry, setExpiry] = useState('');
  const [methods, setMethods] = useState<PaymentMethodSetting[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!settings.data) return;
    setDeposit(String(settings.data.cod_deposit_percent));
    setExpiry(String(settings.data.order_expiry_minutes));
    setMethods(settings.data.payment_methods_enabled);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof patchSettings>[0]) => patchSettings(body),
    onSuccess: (s) => {
      toast.show(fr['settings.saved']);
      qc.setQueryData(['settings'], s);
    },
    onError: (err) => toast.show(errorMessage(err), 'error'),
  });

  const toggleMethod = (m: PaymentMethodSetting, on: boolean) =>
    setMethods((cur) => (on ? [...cur, m] : cur.filter((x) => x !== m)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const d = Number(deposit);
    const x = Number(expiry);
    if (deposit.trim() === '' || !Number.isInteger(d) || d < 0 || d > 100) {
      next.deposit = fr['settings.deposit.format'];
    }
    if (expiry.trim() === '' || !Number.isInteger(x) || x < 5 || x > 1440) {
      next.expiry = fr['settings.expiry.format'];
    }
    if (methods.length === 0) next.methods = fr['settings.methods.required'];
    setErrors(next);
    if (Object.keys(next).length === 0) {
      save.mutate({
        cod_deposit_percent: d,
        order_expiry_minutes: x,
        payment_methods_enabled: METHODS.filter((m) => methods.includes(m)),
      });
    }
  };

  if (settings.isPending) {
    return <p className="mt-4 text-sm text-inkSecondary">{fr['app.loading']}</p>;
  }
  if (settings.isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        {errorMessage(settings.error)}
      </p>
    );
  }

  return (
    <section aria-labelledby="shop-settings-title" className="mt-6">
      <h2 id="shop-settings-title" className="text-lg font-semibold">
        {fr['settings.shop.title']}
      </h2>
      <form
        onSubmit={submit}
        noValidate
        aria-label={fr['settings.shop.title']}
        className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-2"
      >
        <TextField
          label={fr['settings.deposit']}
          hint={fr['settings.deposit.hint']}
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          value={deposit}
          error={errors.deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
        <TextField
          label={fr['settings.expiry']}
          hint={fr['settings.expiry.hint']}
          type="number"
          min={5}
          max={1440}
          inputMode="numeric"
          value={expiry}
          error={errors.expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
        <fieldset className="md:col-span-2">
          <legend className="text-xs font-medium text-inkSecondary">
            {fr['settings.methods']}
          </legend>
          <p className="mt-1 text-xs text-inkSecondary">{fr['settings.methods.hint']}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            {METHODS.map((m) => (
              <CheckField
                key={m}
                id={`method-${m}`}
                label={fr[`orders.payment.${m}` as FrKey]}
                checked={methods.includes(m)}
                onChange={(v) => toggleMethod(m, v)}
              />
            ))}
          </div>
          {errors.methods && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {errors.methods}
            </p>
          )}
        </fieldset>
        <div className="md:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {fr['settings.save']}
          </Button>
        </div>
      </form>
    </section>
  );
}
