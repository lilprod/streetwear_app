export type SectionTab<T extends string> = { id: T; label: string };

export function SectionTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly SectionTab<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav aria-label={label} className="mt-4 overflow-x-auto pb-2">
      <ul className="flex gap-2">
        {tabs.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={value === t.id}
              onClick={() => onChange(t.id)}
              className={`whitespace-nowrap rounded-admin border px-3 py-1.5 text-sm ${
                value === t.id
                  ? 'border-ink bg-ink text-surface'
                  : 'border-border bg-surface text-ink hover:bg-surfaceMuted'
              }`}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
