import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { formatLome } from '@streetwear/shared';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { DateField } from '../../components/date-field';
import { errorClass, inputClass, labelClass } from '../../components/form-classes';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import {
  generateSlots,
  listSlots,
  updateSlot,
  type AdminSlot,
  type AdminStore,
} from '../../lib/logistics-api';

const col = createColumnHelper<AdminSlot>();

function CapacityCell({ storeId, slot }: { storeId: string; slot: AdminSlot }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [value, setValue] = useState(String(slot.capacity));
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;
  const save = useMutation({
    mutationFn: () => updateSlot(storeId, slot.id, n),
    onSuccess: () => {
      toast.show(fr['slots.updated'], 'success');
      void qc.invalidateQueries({ queryKey: ['slots', storeId] });
    },
    onError: (e) => {
      setValue(String(slot.capacity));
      toast.show(errorMessage(e), 'error');
    },
  });
  const label = `${fr['slots.capacity']} ${formatLome(slot.startsAt, 'time')}`;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && n !== slot.capacity) save.mutate();
      }}
    >
      <input
        aria-label={label}
        aria-invalid={!valid}
        inputMode="numeric"
        className={`${inputClass} w-20 font-mono`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        type="submit"
        variant="secondary"
        aria-label={`${fr['slots.save']} ${formatLome(slot.startsAt, 'time')}`}
        disabled={!valid || n === slot.capacity || save.isPending}
      >
        {fr['slots.save']}
      </Button>
    </form>
  );
}

export function SlotsPanel({ store }: { store: AdminStore }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [days, setDays] = useState('7');
  const [capacity, setCapacity] = useState(String(store.defaultSlotCapacity));

  const q = useQuery({
    queryKey: ['slots', store.id, date],
    queryFn: () => listSlots(store.id, date || undefined),
  });
  const daysN = Number(days);
  const capN = Number(capacity);
  const genValid =
    Number.isInteger(daysN) &&
    daysN >= 1 &&
    daysN <= 30 &&
    Number.isInteger(capN) &&
    capN >= 1 &&
    capN <= 100;
  const generate = useMutation({
    mutationFn: () => generateSlots(store.id, { days: daysN, capacity: capN }),
    onSuccess: (r) => {
      toast.show(fr['slots.generated'].replace('{n}', String(r.created)), 'success');
      void qc.invalidateQueries({ queryKey: ['slots', store.id] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (genValid) generate.mutate();
  };

  const columns = [
    col.accessor('startsAt', {
      header: fr['slots.col.time'],
      cell: (c) => (
        <span className="whitespace-nowrap font-mono">
          {formatLome(c.getValue(), 'time')} – {formatLome(c.row.original.endsAt, 'time')}
        </span>
      ),
    }),
    col.accessor('capacity', {
      header: fr['slots.col.capacity'],
      cell: (c) => <CapacityCell storeId={store.id} slot={c.row.original} />,
    }),
    col.accessor('booked', {
      header: fr['slots.col.booked'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    col.accessor('remaining', {
      header: fr['slots.col.remaining'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
  ];

  return (
    <section aria-labelledby={`slots-${store.id}`} className="mt-6">
      <h2 id={`slots-${store.id}`} className="mb-2 text-lg font-semibold">
        {fr['slots.title']} — {store.name}
      </h2>
      <div className="mb-3 flex flex-wrap items-end gap-4 rounded-admin-lg border border-border bg-surface p-3">
        <DateField label={fr['slots.date']} value={date} onChange={setDate} />
        <form
          onSubmit={submit}
          className="flex flex-wrap items-end gap-3"
          aria-label={fr['slots.generate']}
        >
          <label className={labelClass}>
            {fr['slots.days']}
            <input
              className={`${inputClass} w-24 font-mono`}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            {fr['slots.capacityDefault']}
            <input
              className={`${inputClass} w-24 font-mono`}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={!genValid || generate.isPending}>
            {fr['slots.generate']}
          </Button>
        </form>
      </div>
      {generate.error && (
        <p role="alert" className={`mb-2 ${errorClass}`}>
          {errorMessage(generate.error)}
        </p>
      )}
      {q.error && (
        <p role="alert" className={`mb-2 ${errorClass}`}>
          {errorMessage(q.error)}
        </p>
      )}
      {q.isPending ? (
        <p className="text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <DataTable
          caption={`${fr['slots.title']} ${store.name}`}
          columns={columns}
          data={q.data ?? []}
          getRowId={(r) => r.id}
          emptyMessage={fr['slots.empty']}
        />
      )}
    </section>
  );
}
