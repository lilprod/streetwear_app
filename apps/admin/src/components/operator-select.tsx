import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { fr } from '../i18n/fr';
import { errorMessage } from '../lib/errors';
import { listOperators } from '../lib/orders-api';

export function useOperatorChoice(enabled = true) {
  const { session } = useAuth();
  const [chosen, setChosen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['operators'], queryFn: listOperators, enabled });
  const operators = q.data?.items ?? [];
  const fallback = operators.find((o) => o.id === session?.userId)?.id ?? operators[0]?.id ?? '';
  const value = chosen && operators.some((o) => o.id === chosen) ? chosen : fallback;
  return { operators, value, setValue: setChosen, loading: q.isPending, error: q.error };
}

export type OperatorChoice = ReturnType<typeof useOperatorChoice>;

export function OperatorSelect({ choice, hint }: { choice: OperatorChoice; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium">
        {fr['production.operator']}
      </label>
      <select
        id={id}
        value={choice.value}
        disabled={choice.loading || choice.operators.length === 0}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => choice.setValue(e.target.value)}
        className="mt-1 min-h-10 w-full min-w-48 rounded-admin border border-borderStrong bg-surface px-3 text-sm text-ink"
      >
        {choice.loading && <option value="">{fr['production.operator.loading']}</option>}
        {!choice.loading && choice.operators.length === 0 && (
          <option value="">{fr['production.operator.none']}</option>
        )}
        {choice.operators.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-h`} className="mt-1 text-xs text-inkSecondary">
          {hint}
        </p>
      )}
      {choice.error != null && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {errorMessage(choice.error)}
        </p>
      )}
    </div>
  );
}
