import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fr } from '../../i18n/fr';
import { listCouriers, type AdminCourier } from '../../lib/logistics-api';
import { inputClass } from '../../components/form-classes';

/** Liste des livreurs actifs : GET /admin/couriers. En cas d'erreur, un message clair s'affiche. */
export function useCourierChoice() {
  const [chosen, setChosen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['couriers'], queryFn: listCouriers, retry: false });
  const couriers: AdminCourier[] = q.data?.items ?? [];
  const selected =
    chosen && couriers.some((c) => c.id === chosen) ? chosen : (couriers[0]?.id ?? '');
  return {
    couriers,
    value: selected,
    valid: !!selected,
    setValue: setChosen,
    loading: q.isPending,
    error: q.error,
  };
}

export type CourierChoice = ReturnType<typeof useCourierChoice>;

export function CourierSelect({ choice }: { choice: CourierChoice }) {
  const id = useId();
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
