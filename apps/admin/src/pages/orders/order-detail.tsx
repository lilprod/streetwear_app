import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatLome, formatTgPhone, formatXof, ORDER_STATUS_LABELS_FR } from '@streetwear/shared';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/status-badge';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { ApiRequestError } from '../../lib/errors';
import { getOrder, type AdminOrder } from '../../lib/orders-api';
import { PrintFilesPanel } from '../production/print-files-panel';
import { SheetButton } from '../production/sheet-button';
import { ForbiddenPage, NotFoundPage } from '../status-pages';
import { DeliveryBlock, PaymentsBlock, ProductionBlock } from './order-blocks';
import { paymentLabel } from './orders-list';
import { TransitionPanel } from './transition-panel';

const card = 'rounded-admin-lg border border-border bg-surface p-4';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-inkSecondary">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const actorLabel = (type: string): string =>
  (fr as Record<string, string>)[`order.history.${type}`] ?? type;

function Items({ order }: { order: AdminOrder }) {
  return (
    <section aria-labelledby="order-items" className={card}>
      <h2 id="order-items" className="text-lg font-semibold">
        {fr['order.items']}
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {order.items.map((it) => (
          <li key={it.id} className="flex flex-wrap gap-4 py-3">
            <div className="flex gap-2">
              {(
                [
                  [it.design.previewFrontUrl, fr['order.item.previewFront']],
                  [it.design.previewBackUrl, fr['order.item.previewBack']],
                ] as [string | null, string][]
              ).map(([src, alt]) =>
                src ? (
                  <img
                    key={alt}
                    src={src}
                    alt={alt}
                    className="h-24 w-24 rounded-admin border border-border object-contain"
                  />
                ) : null,
              )}
              {!it.design.previewFrontUrl && !it.design.previewBackUrl && (
                <span className="flex h-24 w-24 items-center justify-center rounded-admin border border-border p-2 text-center text-xs text-inkSecondary">
                  {fr['order.item.noPreview']}
                </span>
              )}
            </div>
            <dl className="min-w-48 flex-1">
              <Row label={fr['order.item.size']}>
                <span className="font-mono">{it.size}</span>
              </Row>
              <Row label={fr['order.item.quantity']}>
                <span className="font-mono">{it.quantity}</span>
              </Row>
              <Row label={fr['order.item.unit']}>
                <span className="font-mono">{formatXof(it.unitPriceXof)}</span>
              </Row>
              <Row label={fr['order.item.line']}>
                <span className="font-mono">{formatXof(it.lineTotalXof)}</span>
              </Row>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { role } = useAuth();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });

  if (q.error instanceof ApiRequestError && q.error.status === 404) return <NotFoundPage />;
  if (q.error instanceof ApiRequestError && q.error.status === 403) return <ForbiddenPage />;
  const o = q.data;
  const isProd = role === 'production' || role === 'super_admin';

  return (
    <section>
      <Link to="/commandes" className="text-sm underline underline-offset-2">
        {fr['order.back']}
      </Link>
      {q.isPending && <p className="mt-4 text-sm text-inkSecondary">{fr['app.loading']}</p>}
      {q.error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {fr['order.loadError']} {errorMessage(q.error)}
        </p>
      )}
      {o && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-semibold leading-10">
              {fr['order.title']} <span className="font-mono">{o.number}</span>
            </h1>
            <StatusBadge status={o.status} />
            {isProd && <SheetButton orderId={o.id} orderNumber={o.number} />}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <TransitionPanel order={o} />
              <Items order={o} />
              <ProductionBlock order={o} />
              {isProd && <PrintFilesPanel order={o} />}
              <DeliveryBlock order={o} />
              <PaymentsBlock order={o} />
              <section aria-labelledby="order-history" className={card}>
                <h2 id="order-history" className="text-lg font-semibold">
                  {fr['order.history']}
                </h2>
                <ol className="mt-3 space-y-2">
                  {o.statusHistory.map((h, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-mono text-xs text-inkSecondary">
                        {formatLome(h.at)}
                      </span>{' '}
                      <span className="font-medium">{ORDER_STATUS_LABELS_FR[h.to]}</span>{' '}
                      <span className="text-inkSecondary">· {actorLabel(h.actorType)}</span>
                      {h.note && <span className="block text-inkSecondary">{h.note}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <div className="flex flex-col gap-4">
              <section aria-labelledby="order-customer" className={card}>
                <h2 id="order-customer" className="text-lg font-semibold">
                  {fr['order.customer']}
                </h2>
                <p className="mt-2 text-sm">{o.customer.name ?? '—'}</p>
                {o.customer.phone && (
                  <p className="font-mono text-sm text-inkSecondary">
                    {formatTgPhone(o.customer.phone)}
                  </p>
                )}
              </section>
              <section aria-labelledby="order-reception" className={card}>
                <h2 id="order-reception" className="text-lg font-semibold">
                  {fr['order.reception']}
                </h2>
                {o.reception.type === 'home' ? (
                  <dl className="mt-2">
                    <Row label={fr['order.reception.address']}>
                      {o.reception.address.district}, {o.reception.address.landmark}
                    </Row>
                    <Row label={fr['orders.col.reception']}>{fr['orders.reception.home']}</Row>
                    <Row label={fr['order.customer']}>
                      <span className="font-mono">
                        {formatTgPhone(o.reception.address.recipientPhone)}
                      </span>
                    </Row>
                  </dl>
                ) : (
                  <dl className="mt-2">
                    <Row label={fr['order.reception.store']}>
                      {o.reception.store.name}
                      <br />
                      <span className="text-inkSecondary">{o.reception.store.address}</span>
                    </Row>
                    <Row label={fr['order.reception.slot']}>
                      <span className="font-mono">{formatLome(o.reception.slot.startsAt)}</span>
                    </Row>
                  </dl>
                )}
              </section>
              <section aria-labelledby="order-payment" className={card}>
                <h2 id="order-payment" className="text-lg font-semibold">
                  {fr['order.payment']}
                </h2>
                <dl className="mt-2">
                  <Row label={fr['order.payment.method']}>{paymentLabel(o.paymentMethod)}</Row>
                  <Row label={fr['order.payment.subtotal']}>
                    <span className="font-mono">{formatXof(o.subtotalXof)}</span>
                  </Row>
                  <Row label={fr['order.payment.delivery']}>
                    <span className="font-mono">{formatXof(o.deliveryFeeXof)}</span>
                  </Row>
                  <Row label={fr['order.payment.total']}>
                    <span className="font-mono font-semibold">{formatXof(o.totalXof)}</span>
                  </Row>
                  {o.depositXof !== null && (
                    <Row label={fr['order.payment.deposit']}>
                      <span className="font-mono">{formatXof(o.depositXof)}</span>
                    </Row>
                  )}
                </dl>
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
