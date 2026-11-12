import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/button';
import { errorClass, inputClass, labelClass } from '../../components/form-classes';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { createStore, updateStore, type AdminStore } from '../../lib/logistics-api';

export const OPENING_KEY_RE = /^(lun|mar|mer|jeu|ven|sam|dim)(-(lun|mar|mer|jeu|ven|sam|dim))?$/;
export const OPENING_VALUE_RE = /^(fermé|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)$/;

type HoursRow = { days: string; hours: string };

export function StoreForm({ store, onDone }: { store: AdminStore | null; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [lat, setLat] = useState(store ? String(store.lat) : '');
  const [lng, setLng] = useState(store ? String(store.lng) : '');
  const [capacity, setCapacity] = useState(String(store?.defaultSlotCapacity ?? 5));
  const [active, setActive] = useState(store?.active ?? true);
  const [rows, setRows] = useState<HoursRow[]>(
    store
      ? Object.entries(store.openingHours).map(([days, hours]) => ({ days, hours }))
      : [{ days: 'lun-sam', hours: '09:00-19:00' }],
  );
  const [submitted, setSubmitted] = useState(false);

  const latN = Number(lat);
  const lngN = Number(lng);
  const capN = Number(capacity);
  const errors = {
    name: name.trim() ? null : fr['stores.error.name'],
    address: address.trim() ? null : fr['stores.error.address'],
    lat: lat !== '' && latN >= -90 && latN <= 90 ? null : fr['stores.error.lat'],
    lng: lng !== '' && lngN >= -180 && lngN <= 180 ? null : fr['stores.error.lng'],
    capacity:
      Number.isInteger(capN) && capN >= 1 && capN <= 100 ? null : fr['stores.error.capacity'],
    hours: rows.every((r) => OPENING_KEY_RE.test(r.days) && OPENING_VALUE_RE.test(r.hours))
      ? null
      : fr['stores.error.hours'],
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        address: address.trim(),
        lat: latN,
        lng: lngN,
        defaultSlotCapacity: capN,
        active,
        openingHours: Object.fromEntries(rows.map((r) => [r.days, r.hours])),
      };
      return store ? updateStore(store.id, body) : createStore(body);
    },
    onSuccess: () => {
      toast.show(fr[store ? 'stores.updated' : 'stores.created'], 'success');
      void qc.invalidateQueries({ queryKey: ['stores'] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!invalid) save.mutate();
  };
  const setRow = (i: number, patch: Partial<HoursRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    error: string | null,
    mono = false,
  ) => (
    <label className={labelClass}>
      {label}
      <input
        className={`${inputClass} ${mono ? 'font-mono' : ''}`}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={submitted && !!error}
      />
      {submitted && error && <span className={errorClass}>{error}</span>}
    </label>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={fr[store ? 'stores.form.edit' : 'stores.form.create']}
      className="mt-4 rounded-admin-lg border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">
        {fr[store ? 'stores.form.edit' : 'stores.form.create']}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {field(fr['stores.name'], name, setName, errors.name)}
        {field(fr['stores.address'], address, setAddress, errors.address)}
        {field(fr['stores.lat'], lat, setLat, errors.lat, true)}
        {field(fr['stores.lng'], lng, setLng, errors.lng, true)}
        {field(fr['stores.defaultCapacity'], capacity, setCapacity, errors.capacity, true)}
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-inkSecondary">{fr['stores.hours']}</legend>
        <p className="text-xs text-inkSecondary">{fr['stores.hours.hint']}</p>
        {rows.map((r, i) => (
          <div key={i} className="mt-2 flex flex-wrap items-end gap-2">
            <label className={labelClass}>
              {fr['stores.hours.days']}
              <input
                className={`${inputClass} w-32 font-mono`}
                value={r.days}
                onChange={(e) => setRow(i, { days: e.target.value })}
              />
            </label>
            <label className={labelClass}>
              {fr['stores.hours.range']}
              <input
                className={`${inputClass} w-40 font-mono`}
                value={r.hours}
                onChange={(e) => setRow(i, { hours: e.target.value })}
              />
            </label>
            <Button
              variant="secondary"
              aria-label={`${fr['stores.hours.remove']} ${r.days}`}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              {fr['stores.hours.remove']}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => setRows((rs) => [...rs, { days: '', hours: '' }])}
        >
          {fr['stores.hours.add']}
        </Button>
        {submitted && errors.hours && (
          <p role="alert" className={`mt-1 ${errorClass}`}>
            {errors.hours}
          </p>
        )}
      </fieldset>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {fr['stores.active']}
      </label>
      {save.error && (
        <p role="alert" className={`mt-3 ${errorClass}`}>
          {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {fr['stores.save']}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {fr['dialog.cancel']}
        </Button>
      </div>
    </form>
  );
}
