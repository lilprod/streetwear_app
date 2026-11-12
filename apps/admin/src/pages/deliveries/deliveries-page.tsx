import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { formatLome, formatTgPhone, formatXof } from '@streetwear/shared';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { DateField, frToIso } from '../../components/date-field';
import { inputClass, labelClass } from '../../components/form-classes';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import {
  assignCourier,
  DELIVERY_STATUSES,
  listDeliveries,
  type AdminDelivery,
  type DeliveryStatus,
} from '../../lib/logistics-api';
import { CourierSelect, useCourierChoice } from './courier-select';

const col = createColumnHelper<AdminDelivery>();

export const todayIso = (): string => frToIso(formatLome(new Date(), 'date')) ?? '';

const tone: Record<DeliveryStatus, string> = {
  to_assign: 'bg-status-info-bg text-status-info-ink',
  assigned: 'bg-status-production-bg text-status-production-ink',
  in_progress: 'bg-status-shipping-bg text-status-shipping-ink',
  delivered: 'bg-status-success-bg text-status-success-ink',
  failed: 'bg-status-danger-bg text-status-danger-ink border border-danger font-semibold',
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span
      data-delivery={status}
      className={`inline-flex items-center rounded-admin px-2 py-0.5 text-xs font-medium ${tone[status]}`}
    >
      {status === 'failed' && <span aria-hidden="true">! </span>}
      {fr[`delivery.status.${status}` as FrKey]}
    </span>
  );
}

export function DeliveriesTabs() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-admin px-3 py-2 text-sm ${isActive ? 'bg-ink font-medium text-surface' : 'text-ink hover:bg-surfaceMuted'}`;
  return (
    <nav aria-label={fr['deliveries.tabs']} className="mb-4 flex gap-1">
      <NavLink to="/livraisons" end className={link}>
        {fr['deliveries.tab.runs']}
      </NavLink>
      <NavLink to="/livraisons/zones" className={link}>
        {fr['deliveries.tab.zones']}
      </NavLink>
    </nav>
  );
}

export function DeliveriesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const choice = useCourierChoice();
  const [date, setDate] = useState(todayIso);
  const [status, setStatus] = useState<DeliveryStatus | ''>('');

  const list = useQuery({
    queryKey: ['deliveries', date, status],
    queryFn: () => listDeliveries({ date: date || undefined, status: status || undefined }),
  });
  const rows = list.data?.items ?? [];

  const assign = useMutation({
    mutationFn: (d: AdminDelivery) => assignCourier(d.id, choice.value),
    onSuccess: (d) => {
      toast.show(fr['deliveries.assigned'], 'success');
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['order', d.orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const columns = [
    col.display({
      id: 'order',
      header: fr['deliveries.col.order'],
      cell: (c) => {
        const d = c.row.original;
        return (
          <Link
            to={`/commandes/${d.orderId}`}
            className="font-mono font-medium underline underline-offset-2"
          >
            {d.orderNumber}
          </Link>
        );
      },
    }),
    col.display({
      id: 'customer',
      header: fr['deliveries.col.customer'],
      cell: (c) => {
        const d = c.row.original;
        return (
          <div>
            {d.customerName && <div>{d.customerName}</div>}
            <div className="font-mono text-xs text-inkSecondary">
              {formatTgPhone(d.recipientPhone)}
            </div>
          </div>
        );
      },
    }),
    col.display({
      id: 'address',
      header: fr['deliveries.col.address'],
      cell: (c) => (
        <div className="min-w-40">
          <div>{c.row.original.addressLabel}</div>
          <div className="text-xs text-inkSecondary">{c.row.original.landmark}</div>
        </div>
      ),
    }),
    col.display({
      id: 'zone',
      header: fr['deliveries.col.zone'],
      cell: (c) => c.row.original.zone?.name ?? '—',
    }),
    col.accessor('scheduledFor', {
      header: fr['deliveries.col.scheduled'],
      cell: (c) => {
        const v = c.getValue();
        return v ? <span className="whitespace-nowrap font-mono">{formatLome(v)}</span> : '—';
      },
    }),
    col.accessor('codBalanceXof', {
      header: fr['deliveries.col.cod'],
      cell: (c) => {
        const v = c.getValue();
        return v === 0 ? (
          <span className="text-inkSecondary">{fr['deliveries.cod.none']}</span>
        ) : (
          <span className="whitespace-nowrap font-mono">{formatXof(v)}</span>
        );
      },
    }),
    col.accessor('status', {
      header: fr['deliveries.col.status'],
      cell: (c) => <DeliveryStatusBadge status={c.getValue() as DeliveryStatus} />,
    }),
    col.display({
      id: 'courier',
      header: fr['deliveries.col.courier'],
      cell: (c) => {
        const courier = c.row.original.courier;
        if (!courier)
          return <span className="text-inkSecondary">{fr['deliveries.unassigned']}</span>;
        return courier.name;
      },
    }),
    col.display({
      id: 'actions',
      header: fr['deliveries.col.action'],
      enableSorting: false,
      cell: (c) => {
        const d = c.row.original;
        if (d.status !== 'to_assign' && d.status !== 'assigned' && d.status !== 'failed')
          return null;
        const label = fr[d.status === 'to_assign' ? 'deliveries.assign' : 'deliveries.reassign'];
        const number = d.orderNumber;
        return (
          <Button
            disabled={assign.isPending || !choice.valid}
            aria-label={`${label} ${number}`}
            onClick={() => assign.mutate(d)}
          >
            {label}
          </Button>
        );
      },
    }),
  ];

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['nav.deliveries']}</h1>
      <p className="mt-1 text-sm text-inkSecondary">{fr['deliveries.subtitle']}</p>
      <div className="mt-4">
        <DeliveriesTabs />
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-admin-lg border border-border bg-surface p-3">
        <DateField label={fr['deliveries.date']} value={date} onChange={setDate} />
        <label className={labelClass}>
          {fr['deliveries.filter.status']}
          <select
            className={`${inputClass} w-auto min-w-40`}
            value={status}
            onChange={(e) => setStatus(e.target.value as DeliveryStatus | '')}
          >
            <option value="">{fr['deliveries.filter.all']}</option>
            {DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {fr[`delivery.status.${s}` as FrKey]}
              </option>
            ))}
          </select>
        </label>
        <CourierSelect choice={choice} />
      </div>
      {choice.error != null && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(choice.error)}
        </p>
      )}
      {list.error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      {list.isPending ? (
        <p className="text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <DataTable
          caption={fr['deliveries.caption']}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          emptyMessage={fr['deliveries.empty']}
        />
      )}
    </section>
  );
}
