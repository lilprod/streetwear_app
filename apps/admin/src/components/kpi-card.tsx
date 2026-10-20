export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-admin-lg border border-border bg-surface p-4">
      <dt className="text-xs font-medium text-inkSecondary">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-semibold text-ink">{value}</dd>
      {hint && <dd className="mt-1 text-xs text-inkSecondary">{hint}</dd>}
    </div>
  );
}
