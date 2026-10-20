import { ORDER_STATUS_LABELS_FR, type OrderStatus } from '@streetwear/shared';
import type { StatusTone } from '@streetwear/ui-tokens';

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending_payment: 'neutral',
  payment_failed: 'danger',
  expired: 'neutral',
  paid: 'info',
  deposit_paid: 'info',
  in_production: 'production',
  ready: 'success',
  shipped: 'shipping',
  ready_for_pickup: 'success',
  delivered: 'neutral',
  delivery_failed: 'danger',
  returned: 'neutral',
  cancelled: 'danger',
  refunded: 'neutral',
};

const toneClass: Record<StatusTone, string> = {
  info: 'bg-status-info-bg text-status-info-ink',
  production: 'bg-status-production-bg text-status-production-ink',
  success: 'bg-status-success-bg text-status-success-ink',
  shipping: 'bg-status-shipping-bg text-status-shipping-ink',
  neutral: 'bg-status-neutral-bg text-status-neutral-ink',
  danger: 'bg-status-danger-bg text-status-danger-ink',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      data-tone={STATUS_TONE[status]}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[STATUS_TONE[status]]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {ORDER_STATUS_LABELS_FR[status]}
    </span>
  );
}
