import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fr } from '../../i18n/fr';
import { ApiRequestError } from '../../lib/errors';
import { listCouriers, type AdminCourier } from '../../lib/logistics-api';
import { inputClass } from '../../components/form-classes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La liste des livreurs vient de GET /admin/couriers (route proposée, absente du contrat).
 * Si elle répond 404, repli : saisie de l'identifiant du livreur.
 */
export function useCourierChoice() {
  const [chosen, setChosen] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const q = useQuery({ queryKey: ['couriers'], queryFn: listCouriers, retry: false });
  const unavailable = q.error instanceof ApiRequestError && q.error.status === 404;
  const couriers: AdminCourier[] = q.data?.items ?? [];
  const selected =
    chosen && couriers.some((c) => c.id === chosen) ? chosen : (couriers[0]?.id ?? '');
  const value = unavailable ? manual.trim() : selected;
  return {
    couriers,
    value,
    valid: unavailable ? UUID.test(value) : !!value,
    setValue: unavailable ? setManual : setChosen,
    loading: q.isPending,
    unavailable,
    error: q.error && !unavailable ? q.error : null,
    nameOf: (id: string | null): string | null =>
      id ? (couriers.find((c) => c.id === id)?.name ?? null) : null,
  };
}

export type CourierChoice = ReturnType<typeof useCourierChoice>;

export function CourierSelect({ choice }: { choice: CourierChoice }) {
  const id = useId();
  if (choice.unavailable) {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium">
          {fr['deliveries.courier.id']}
        </label>
        <input
          id={id}
          value={choice.value}
          onChange={(e) => choice.setValue(e.target.value)}
          aria-describedby={`${id}-h`}
          className={`${inputClass} mt-1 min-w-72 font-mono`}
        />
        <p id={`${id}-h`} className="mt-1 text-xs text-inkSecondary">
          {fr['deliveries.courier.idHint']}
        </p>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium">
        {fr['deliveries.courier']}
      </label>
      <select
        id={id}
        value={choice.value}
        disabled={choice.loading || choice.couriers.length === 0}
        onChange={(e) => choice.setValue(e.target.value)}
        className={`${inputClass} mt-1 min-w-48`}
      >
        {choice.loading && <option value="">{fr['deliveries.courier.loading']}</option>}
        {!choice.loading && choice.couriers.length === 0 && (
          <option value="">{fr['deliveries.courier.none']}</option>
        )}
        {choice.couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
