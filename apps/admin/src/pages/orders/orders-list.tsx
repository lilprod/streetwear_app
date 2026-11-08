import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  formatLome,
  formatTgPhone,
  formatXof,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS_FR,
  type OrderStatus,
  type ReceptionType,
} from '@streetwear/shared';
import { useAuth } from '../../auth/auth-context';
import { DataTable } from '../../components/data-table';
import { FilterBar } from '../../components/filter-bar';
import { StatusBadge } from '../../components/status-badge';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import {
  getStatusCounts,
  listOrders,
  type AdminOrderSummary,
  type OrdersFilters,
} from '../../lib/orders-api';

const col = createColumnHelper<AdminOrderSummary>();
const PAYMENTS = ['tmoney', 'flooz', 'card', 'cod'] as const;
const selectClass = 'min-h-10 rounded-admin border border-borderStrong bg-surface px-3 text-sm';

export const paymentLabel = (m: string): string =>
  (fr as Record<string, string>)[`orders.payment.${m}`] ?? m;

const startOfDay = (d: string) => (d ? `${d}T00:00:00.000Z` : undefined);
const endOfDay = (d: string) => (d ? `${d}T23:59:59.999Z` : undefined);

export function OrdersListPage() {
  const { role } = useAuth();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [reception, setReception] = useState<ReceptionType | ''>('');
  const [payment, setPayment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  const filters: OrdersFilters = {
    status: status || undefined,
    receptionType: reception || undefined,
    paymentMethod: payment || undefined,
    from: startOfDay(from),
    to: endOfDay(to),
    q: q || undefined,
  };
  const key = JSON.stringify(filters);

  const [stack, setStack] = useState<string[]>([]);
  const cursor = stack[stack.length - 1];

  const list = useQuery({
    queryKey: ['orders', 'list', key, cursor ?? null],
    queryFn: ({ signal }) => listOrders({ ...filters, cursor }, signal),
  });
  const nextCursor = list.data?.nextCursor;

  const countsAllowed = role === 'order_manager' || role === 'super_admin';
  const counts = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: getStatusCounts,
    enabled: countsAllowed,
  });

  const resetPage = () => setStack([]);
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      resetPage();
    };

  const columns = useMemo(
    () => [
      col.accessor('number', {
        header: fr['orders.col.number'],
        cell: (c) => (
          <Link
            to={`/commandes/${c.row.original.id}`}
            className="font-mono font-medium underline underline-offset-2"
          >
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor((r) => r.customer.name ?? '', {
        id: 'customer',
        header: fr['orders.col.customer'],
        cell: (c) => (
          <div>
            <div>{c.getValue() || '—'}</div>
            {c.row.original.customer.phone && (
              <div className="font-mono text-xs text-inkSecondary">
                {formatTgPhone(c.row.original.customer.phone)}
              </div>
            )}
          </div>
        ),
      }),
      col.accessor('status', {
        header: fr['orders.col.status'],
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
      col.accessor('receptionType', {
        header: fr['orders.col.reception'],
        cell: (c) => fr[`orders.reception.${c.getValue()}` as FrKey],
      }),
      col.accessor('paymentMethod', {
        header: fr['orders.col.payment'],
        cell: (c) => paymentLabel(c.getValue()),
      }),
      col.accessor('itemCount', {
        header: fr['orders.col.items'],
        cell: (c) => <span className="font-mono">{c.getValue()}</span>,
      }),
      col.accessor('totalXof', {
        header: fr['orders.col.total'],
        cell: (c) => <span className="whitespace-nowrap font-mono">{formatXof(c.getValue())}</span>,
      }),
      col.accessor('createdAt', {
        header: fr['orders.col.date'],
        cell: (c) => (
          <span className="whitespace-nowrap font-mono">{formatLome(c.getValue())}</span>
        ),
      }),
    ],
    [],
  );

  const tab = (value: OrderStatus | '', label: string, count?: number) => (
    <li key={value || 'all'}>
      <button
        type="button"
        aria-pressed={status === value}
        onClick={() => change(setStatus)(value)}
        className={`whitespace-nowrap rounded-admin border px-3 py-1.5 text-sm ${
          status === value
            ? 'border-ink bg-ink text-surface'
            : 'border-border bg-surface text-ink hover:bg-surfaceMuted'
        }`}
      >
        {label}
        {count !== undefined && <span className="ml-1.5 font-mono text-xs">{count}</span>}
      </button>
    </li>
  );

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['orders.title']}</h1>
      <nav aria-label={fr['orders.statusTabs']} className="mt-4 overflow-x-auto pb-2">
        <ul className="flex gap-2">
          {tab('', fr['orders.allStatuses'], counts.data?.ordersCount)}
          {ORDER_STATUSES.map((s) =>
            tab(
              s,
              ORDER_STATUS_LABELS_FR[s],
              counts.data ? (counts.data.byStatus[s] ?? 0) : undefined,
            ),
          )}
        </ul>
      </nav>
      <div className="mt-2">
        <FilterBar
          searchLabel={fr['orders.search']}
          search={search}
          onSearchChange={setSearch}
          onSubmit={() => {
            setQ(search.trim());
            resetPage();
          }}
          onReset={() => {
            setStatus('');
            setReception('');
            setPayment('');
            setFrom('');
            setTo('');
            setSearch('');
            setQ('');
            resetPage();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
            {fr['orders.reception']}
            <select
              className={selectClass}
              value={reception}
              onChange={(e) => change(setReception)(e.target.value as ReceptionType | '')}
            >
              <option value="">{fr['orders.reception.all']}</option>
              <option value="home">{fr['orders.reception.home']}</option>
              <option value="pickup">{fr['orders.reception.pickup']}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
            {fr['orders.payment']}
            <select
              className={selectClass}
              value={payment}
              onChange={(e) => change(setPayment)(e.target.value)}
            >
              <option value="">{fr['orders.payment.all']}</option>
              {PAYMENTS.map((p) => (
                <option key={p} value={p}>
                  {paymentLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
            {fr['orders.from']}
            <input
              type="date"
              className={selectClass}
              value={from}
              onChange={(e) => change(setFrom)(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
            {fr['orders.to']}
            <input
              type="date"
              className={selectClass}
              value={to}
              onChange={(e) => change(setTo)(e.target.value)}
            />
          </label>
        </FilterBar>
      </div>
      {list.error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      {list.isPending ? (
        <p className="text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <DataTable
          caption={fr['orders.caption']}
          columns={columns}
          data={list.data?.items ?? []}
          getRowId={(r) => r.id}
          hasPrevious={stack.length > 0}
          hasNext={!!nextCursor}
          onPrevious={() => setStack((s) => s.slice(0, -1))}
          onNext={() => nextCursor && setStack((s) => [...s, nextCursor])}
        />
      )}
    </section>
  );
}
