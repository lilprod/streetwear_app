import { useId } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { fr } from '../i18n/fr';
import { Button } from './button';

export type FilterBarProps = {
  searchLabel?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit?: () => void;
  onReset?: () => void;
  children?: ReactNode;
};

export function FilterBar({
  searchLabel = fr['filter.search'],
  search,
  onSearchChange,
  onSubmit,
  onReset,
  children,
}: FilterBarProps) {
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };
  return (
    <form
      role="search"
      onSubmit={submit}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-admin-lg border border-border bg-surface p-3"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-inkSecondary">
          {searchLabel}
        </label>
        <input
          id={id}
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-h-10 rounded-admin border border-borderStrong bg-surface px-3 text-sm"
        />
      </div>
      {children}
      {onReset && (
        <Button variant="secondary" onClick={onReset}>
          {fr['filter.reset']}
        </Button>
      )}
    </form>
  );
}
