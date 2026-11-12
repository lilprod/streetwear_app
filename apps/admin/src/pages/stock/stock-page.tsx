import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SIZES, type Size, type TshirtColor } from '@streetwear/shared';
import { Button } from '../../components/button';
import { errorClass, inputClass, labelClass } from '../../components/form-classes';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import {
  listStock,
  moveStock,
  setStockThreshold,
  type AdminStockItem,
} from '../../lib/logistics-api';

type Cell = { colorId: string; size: Size };

function MovementForm({
  colors,
  target,
  onTarget,
}: {
  colors: { id: string; name: string }[];
  target: Cell;
  onTarget: (c: Cell) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<'in' | 'adjust'>('in');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const qty = Number(quantity);
  const errors = {
    quantity:
      quantity !== '' && Number.isInteger(qty) && qty !== 0 && (type === 'adjust' || qty > 0)
        ? null
        : fr[type === 'in' ? 'stock.error.quantityIn' : 'stock.error.quantityAdjust'],
    note: note.trim() ? null : fr['stock.error.note'],
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () =>
      moveStock({
        colorId: target.colorId,
        size: target.size,
        type,
        quantity: qty,
        note: note.trim(),
      }),
    onSuccess: (item) => {
      toast.show(
        fr['stock.moved'].replace('{color}', item.colorName).replace('{size}', item.size),
        'success',
      );
      setQuantity('');
      setNote('');
      setSubmitted(false);
      void qc.invalidateQueries({ queryKey: ['stock'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!invalid) save.mutate();
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={fr['stock.form.title']}
      className="rounded-admin-lg border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">{fr['stock.form.title']}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        <label className={labelClass}>
          {fr['stock.color']}
          <select
            className={inputClass}
            value={target.colorId}
            onChange={(e) => onTarget({ ...target, colorId: e.target.value })}
          >
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {fr['stock.size']}
          <select
            className={inputClass}
            value={target.size}
            onChange={(e) => onTarget({ ...target, size: e.target.value as Size })}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {fr['stock.type']}
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as 'in' | 'adjust')}
          >
            <option value="in">{fr['stock.type.in']}</option>
            <option value="adjust">{fr['stock.type.adjust']}</option>
          </select>
        </label>
        <label className={labelClass}>
          {fr['stock.quantity']}
          <input
            className={`${inputClass} font-mono`}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={submitted && !!errors.quantity}
          />
          {submitted && errors.quantity && <span className={errorClass}>{errors.quantity}</span>}
        </label>
        <label className={labelClass}>
          {fr['stock.note']}
          <input
            className={inputClass}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={submitted && !!errors.note}
          />
          {submitted && errors.note && <span className={errorClass}>{errors.note}</span>}
        </label>
      </div>
      {save.error && (
        <p role="alert" className={`mt-3 ${errorClass}`}>
          {errorMessage(save.error)}
        </p>
      )}
      <Button type="submit" className="mt-4" disabled={save.isPending}>
        {fr['stock.submit']}
      </Button>
    </form>
  );
}

function ThresholdForm({ item }: { item: AdminStockItem }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [value, setValue] = useState(String(item.alertThreshold));
  const n = Number(value);
  const valid = value !== '' && Number.isInteger(n) && n >= 0;
  const save = useMutation({
    mutationFn: () => setStockThreshold(item.id, n),
    onSuccess: () => {
      toast.show(fr['stock.threshold.saved'], 'success');
      void qc.invalidateQueries({ queryKey: ['stock'] });
    },
  });
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <label className={labelClass}>
        {fr['stock.threshold']}
        <input
          className={`${inputClass} w-28 font-mono`}
          inputMode="numeric"
          value={value}
          aria-invalid={!valid}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button type="submit" variant="secondary" disabled={!valid || save.isPending}>
        {fr['stock.threshold.save']}
      </Button>
      {!valid && <span className={errorClass}>{fr['stock.error.threshold']}</span>}
      {save.error && (
        <span role="alert" className={errorClass}>
          {errorMessage(save.error)}
        </span>
      )}
    </form>
  );
}

export function StockPage() {
  const q = useQuery({ queryKey: ['stock'], queryFn: listStock });
  const catalog = useQuery({
    queryKey: ['catalog-colors'],
    queryFn: () => api<TshirtColor[]>('/catalog/colors', { auth: false }),
  });
  const [target, setTarget] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);

  const items = useMemo(() => q.data ?? [], [q.data]);
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catalog.data ?? []) map.set(c.id, c.name);
    for (const i of items) map.set(i.colorId, i.colorName);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [catalog.data, items]);
  const byKey = useMemo(() => new Map(items.map((i) => [`${i.colorId}|${i.size}`, i])), [items]);
  const alerts = items.filter((i) => i.belowThreshold);
  const formTarget: Cell = target ?? {
    colorId: colors[0]?.id ?? '',
    size: SIZES[2],
  };
  const selectedItem = selected ? byKey.get(`${selected.colorId}|${selected.size}`) : undefined;

  const pick = (c: Cell) => {
    setSelected(c);
    setTarget(c);
  };

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['nav.stock']}</h1>
      <p className="mt-1 text-sm text-inkSecondary">{fr['stock.subtitle']}</p>
      {q.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage(q.error)}
        </p>
      )}

      {alerts.length > 0 && (
        <section
          aria-label={fr['stock.alerts']}
          className="mt-4 rounded-admin-lg border border-danger bg-status-danger-bg p-4 text-status-danger-ink"
        >
          <h2 className="text-base font-semibold">
            {fr['stock.alerts']} <span className="font-mono">{alerts.length}</span>
          </h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {alerts.map((a) => (
              <li key={a.id}>
                <span className="font-medium">
                  {a.colorName} {a.size}
                </span>{' '}
                :{' '}
                {fr['stock.alerts.line']
                  .replace('{available}', String(a.available))
                  .replace('{threshold}', String(a.alertThreshold))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4">
        {q.isPending ? (
          <p className="text-sm text-inkSecondary">{fr['app.loading']}</p>
        ) : (
          <div className="rounded-admin-lg border border-border bg-surface">
            <div
              className="overflow-x-auto"
              role="region"
              aria-label={fr['stock.caption']}
              tabIndex={0}
            >
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <caption className="sr-only">{fr['stock.caption']}</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-inkSecondary">
                      {fr['stock.color']}
                    </th>
                    {SIZES.map((s) => (
                      <th
                        key={s}
                        scope="col"
                        className="px-3 py-2 text-center text-xs font-medium text-inkSecondary"
                      >
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colors.length === 0 && (
                    <tr>
                      <td
                        colSpan={SIZES.length + 1}
                        className="px-3 py-6 text-center text-inkSecondary"
                      >
                        {fr['stock.empty']}
                      </td>
                    </tr>
                  )}
                  {colors.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                        {c.name}
                      </th>
                      {SIZES.map((s) => {
                        const item = byKey.get(`${c.id}|${s}`);
                        const low = !!item?.belowThreshold;
                        const isSel = selected?.colorId === c.id && selected.size === s;
                        return (
                          <td key={s} className="px-1 py-1 text-center">
                            <button
                              type="button"
                              data-low={low || undefined}
                              aria-pressed={isSel}
                              aria-label={
                                `${c.name} ${s} : ` +
                                fr['stock.cell.aria']
                                  .replace('{available}', String(item?.available ?? 0))
                                  .replace('{threshold}', String(item?.alertThreshold ?? 0)) +
                                (low ? ` ${fr['stock.cell.low']}` : '')
                              }
                              onClick={() => pick({ colorId: c.id, size: s })}
                              className={`min-h-12 w-full min-w-16 rounded-admin border px-2 py-1 ${
                                low
                                  ? 'border-danger bg-status-danger-bg text-status-danger-ink'
                                  : 'border-border hover:bg-surfaceMuted'
                              } ${isSel ? 'ring-2 ring-ink' : ''}`}
                            >
                              <span className="block font-mono text-base font-semibold">
                                {low && <span aria-hidden="true">! </span>}
                                {item?.available ?? 0}
                              </span>
                              <span className="block font-mono text-xs text-inkSecondary">
                                / {item?.alertThreshold ?? 0}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-inkSecondary">{fr['stock.legend']}</p>
      </div>

      {selected && (
        <section
          aria-label={fr['stock.detail']}
          className="mt-4 rounded-admin-lg border border-border bg-surface p-4"
        >
          <h2 className="text-lg font-semibold">
            {colors.find((c) => c.id === selected.colorId)?.name} {selected.size}
          </h2>
          <dl className="mt-2 flex flex-wrap gap-6 text-sm">
            {(
              [
                ['stock.onHand', selectedItem?.onHand ?? 0],
                ['stock.reserved', selectedItem?.reserved ?? 0],
                ['stock.available', selectedItem?.available ?? 0],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-inkSecondary">{fr[k]}</dt>
                <dd className="font-mono text-base font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3">
            {selectedItem ? (
              <ThresholdForm
                key={`${selectedItem.id}-${selectedItem.alertThreshold}`}
                item={selectedItem}
              />
            ) : (
              <p className="text-sm text-inkSecondary">{fr['stock.noRow']}</p>
            )}
          </div>
        </section>
      )}

      <div className="mt-4">
        <MovementForm colors={colors} target={formTarget} onTarget={setTarget} />
      </div>
    </section>
  );
}
