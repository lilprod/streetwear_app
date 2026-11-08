import { formatLome, formatTgPhone, formatXof } from '@streetwear/shared';
import { JobBadge } from '../../components/job-badge';
import { fr } from '../../i18n/fr';
import type { AdminOrder } from '../../lib/orders-api';
import { paymentLabel } from './orders-list';

const card = 'rounded-admin-lg border border-border bg-surface p-4';

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-inkSecondary">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const presence = (ok: boolean) => fr[ok ? 'order.production.present' : 'order.production.missing'];

export function ProductionBlock({ order }: { order: AdminOrder }) {
  const p = order.production;
  return (
    <section aria-labelledby="order-production" className={card}>
      <h2 id="order-production" className="text-lg font-semibold">
        {fr['order.production']}
      </h2>
      {!p ? (
        <p className="mt-2 text-sm text-inkSecondary">{fr['order.production.none']}</p>
      ) : (
        <>
          <dl className="mt-2">
            <Line label={fr['order.production.operator']}>
              {p.operator?.name ?? fr['production.unassigned']}
            </Line>
            <Line label={fr['order.production.status']}>
              <JobBadge status={p.status} />
            </Line>
          </dl>
          {p.error && (
            <p
              role="alert"
              className="mt-2 rounded-admin border border-danger p-2 text-sm text-danger"
            >
              <span className="font-medium">{fr['order.production.error']} :</span> {p.error}
            </p>
          )}
          <h3 className="mt-3 text-sm font-medium">{fr['order.production.files']}</h3>
          <ul className="mt-1 divide-y divide-border text-sm">
            {order.items.map((it, i) => {
              const f = p.items.find((x) => x.itemId === it.id);
              return (
                <li key={it.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    #{i + 1} · <span className="font-mono">{it.size}</span>
                  </span>
                  <span>
                    {fr['order.production.front']} : {presence(!!f?.front)} ·{' '}
                    {fr['order.production.back']} : {presence(!!f?.back)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function DeliveryBlock({ order }: { order: AdminOrder }) {
  const d = order.delivery;
  return (
    <section aria-labelledby="order-delivery" className={card}>
      <h2 id="order-delivery" className="text-lg font-semibold">
        {fr['order.delivery']}
      </h2>
      {!d ? (
        <p className="mt-2 text-sm text-inkSecondary">{fr['order.delivery.none']}</p>
      ) : (
        <dl className="mt-2">
          <Line label={fr['order.delivery.status']}>{d.status}</Line>
          <Line label={fr['order.delivery.courier']}>
            {d.courier ? (
              <>
                {d.courier.name}
                <br />
                <span className="font-mono text-xs text-inkSecondary">
                  {formatTgPhone(d.courier.phone)}
                </span>
              </>
            ) : (
              fr['order.delivery.noCourier']
            )}
          </Line>
        </dl>
      )}
    </section>
  );
}

export function PaymentsBlock({ order }: { order: AdminOrder }) {
  return (
    <section aria-labelledby="order-payments" className={card}>
      <h2 id="order-payments" className="text-lg font-semibold">
        {fr['order.payments']}
      </h2>
      {order.payments.length === 0 ? (
        <p className="mt-2 text-sm text-inkSecondary">{fr['order.payments.empty']}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border text-sm">
          {order.payments.map((pay) => (
            <li key={pay.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                {paymentLabel(pay.method)} · {pay.status}
              </span>
              <span className="font-mono">
                {formatXof(pay.amountXof)}{' '}
                <span className="text-xs text-inkSecondary">{formatLome(pay.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
