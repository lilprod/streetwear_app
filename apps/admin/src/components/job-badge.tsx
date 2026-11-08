import type { ProductionJobStatus } from '@streetwear/shared';
import { fr, type FrKey } from '../i18n/fr';

const tone: Record<ProductionJobStatus, string> = {
  queued: 'bg-status-neutral-bg text-status-neutral-ink',
  rendering: 'bg-status-info-bg text-status-info-ink',
  ready_to_print: 'bg-status-success-bg text-status-success-ink',
  printed: 'bg-status-neutral-bg text-status-neutral-ink',
  failed: 'bg-status-danger-bg text-status-danger-ink border border-danger font-semibold',
};

export function JobBadge({ status }: { status: ProductionJobStatus | null }) {
  if (!status) return <span className="text-inkSecondary">{fr['production.job.none']}</span>;
  return (
    <span
      data-job={status}
      className={`inline-flex items-center rounded-admin px-2 py-0.5 text-xs font-medium ${tone[status]}`}
    >
      {status === 'failed' && <span aria-hidden="true">! </span>}
      {fr[`production.job.${status}` as FrKey]}
    </span>
  );
}
