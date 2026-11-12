import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  formatLome,
  formatXof,
  type AdminPayment,
  type Reconciliation,
  type ReconciliationMismatch,
} from '@streetwear/shared';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { Badge } from '../../components/field';
import { SectionTabs, type SectionTab } from '../../components/section-tabs';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { listPayments, listReconciliations, type PaymentsFilters } from '../../lib/payments-api';
import { useCursorStack } from '../../lib/paging';

type PaymentsTab = 'journal' | 'reconciliations';
const TABS: readonly SectionTab<PaymentsTab>[] = [
  { id: 'journal', label: fr['payments.tab.journal'] },
  { id: 'reconciliations', label: fr['payments.tab.reconciliations'] },
];
const STATUSES: AdminPayment['status'][] = [
  'pending',
  'succeeded',
  'failed',
  'expired',
  'refunded',
];
const col = createColumnHelper<AdminPayment>();
const recCol = createColumnHelper<Reconciliation>();
const misCol = createColumnHelper<ReconciliationMismatch>();

const label = (prefix: string, v: string | null | undefined): string =>
  v ? ((fr as Record<string, string>)[`${prefix}.${v}`] ?? v) : '—';

const startOfDay = (d: string) => (d ? `${d}T00:00:00.000Z` : undefined);
const endOfDay = (d: string) => (d ? `${d}T23:59:59.999Z` : undefined);
const money = (n: number | null) => (n === null ? '—' : formatXof(n));
const selectClass = 'min-h-10 rounded-admin border border-borderStrong bg-surface px-3 text-sm';

export function PaymentsPage() {
  const [tab, setTab] = useState<PaymentsTab>('journal');
  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['payments.title']}</h1>
      <SectionTabs label={fr['payments.tabs']} tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'journal' ? <Journal /> : <Reconciliations />}
    </section>
  );
}

function Journal() {
  const [status, setStatus] = useState<AdminPayment['status'] | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<PaymentsFilters>({});
  const pager = useCursorStack();
  const key = JSON.stringify(applied);
  const list = useQuery({
    queryKey: ['payments', 'journal', key, pager.cursor ?? null],
    queryFn: ({ signal }) => listPayments(applied, pager.cursor, signal),
  });

  const apply = (e: FormEvent) => {
    e.preventDefault();
    setApplied({
      status: status || undefined,
      from: startOfDay(from),
      to: endOfDay(to),
    });
    pager.reset();
  };

  const columns = useMemo(
    () => [
      col.accessor('orderNumber', {
        header: fr['payments.col.order'],
        cell: (c) => (
          <Link
            to={`/commandes/${c.row.original.orderId}`}
            className="font-mono font-medium underline underline-offset-2"
          >
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor('method', {
        header: fr['payments.col.method'],
        cell: (c) => label('orders.payment', c.getValue()),
      }),
      col.accessor('kind', {
        header: fr['payments.col.kind'],
        cell: (c) => fr[`payments.kind.${c.getValue()}` as FrKey],
      }),
      col.accessor('amountXof', {
        header: fr['payments.col.amount'],
        cell: (c) => <span className="whitespace-nowrap font-mono">{formatXof(c.getValue())}</span>,
      }),
      col.accessor('status', {
        header: fr['payments.col.status'],
        cell: (c) => (
          <Badge tone={c.getValue() === 'failed' ? 'danger' : 'on'}>
            {fr[`payments.status.${c.getValue()}` as FrKey]}
          </Badge>
        ),
      }),
      col.accessor((r) => r.providerRef ?? '', {
        id: 'providerRef',
        header: fr['payments.col.providerRef'],
        cell: (c) => <span className="font-mono text-xs">{c.getValue() || '—'}</span>,
      }),
      col.accessor((r) => r.payerPhone ?? '', {
        id: 'payerPhone',
        header: fr['payments.col.phone'],
        cell: (c) => <span className="font-mono text-xs">{c.getValue() || '—'}</span>,
      }),
      col.accessor((r) => r.failureReason ?? '', {
        id: 'failure',
        header: fr['payments.col.failure'],
        cell: (c) => c.getValue() || '—',
      }),
      col.accessor('createdAt', {
        header: fr['payments.col.date'],
        cell: (c) => (
          <span className="whitespace-nowrap font-mono text-xs">{formatLome(c.getValue())}</span>
        ),
      }),
    ],
    [],
  );

  return (
    <div className="mt-4">
      <form
        role="search"
        aria-label={fr['payments.filter.label']}
        onSubmit={apply}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-admin-lg border border-border bg-surface p-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
          {fr['payments.filter.status']}
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminPayment['status'] | '')}
          >
            <option value="">{fr['payments.filter.allStatuses']}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {fr[`payments.status.${s}` as FrKey]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
          {fr['payments.filter.from']}
          <input
            type="date"
            className={selectClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
          {fr['payments.filter.to']}
          <input
            type="date"
            className={selectClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button type="submit">{fr['filter.apply']}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setStatus('');
            setFrom('');
            setTo('');
            setApplied({});
            pager.reset();
          }}
        >
          {fr['filter.reset']}
        </Button>
      </form>
      {list.isError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      <DataTable
        caption={fr['payments.journal.caption']}
        columns={columns}
        data={list.data?.items ?? []}
        getRowId={(r) => r.id}
        {...pager.pagerProps(list.data?.nextCursor)}
      />
    </div>
  );
}

function Reconciliations() {
  const pager = useCursorStack();
  const list = useQuery({
    queryKey: ['payments', 'reconciliations', pager.cursor ?? null],
    queryFn: ({ signal }) => listReconciliations(pager.cursor, signal),
  });

  const columns = [
    recCol.accessor('date', {
      header: fr['payments.rec.date'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    recCol.accessor('provider', { header: fr['payments.rec.provider'] }),
    recCol.accessor('matched', {
      header: fr['payments.rec.matched'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    recCol.accessor('mismatchCount', {
      header: fr['payments.rec.mismatches'],
      cell: (c) =>
        c.getValue() > 0 ? (
          <Badge tone="danger">
            {fr['payments.rec.mismatchBadge']} {c.getValue()}
          </Badge>
        ) : (
          <Badge tone="on">{fr['payments.rec.none']}</Badge>
        ),
    }),
  ];

  return (
    <div className="mt-4 space-y-6">
      <DataTable
        caption={fr['payments.rec.caption']}
        columns={columns}
        data={list.data?.items ?? []}
        getRowId={(r) => r.id}
        {...pager.pagerProps(list.data?.nextCursor)}
      />
      {list.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      {(list.data?.items ?? [])
        .filter((r) => r.mismatchCount > 0)
        .map((r) => (
          <MismatchTable key={r.id} rec={r} />
        ))}
    </div>
  );
}

function MismatchTable({ rec }: { rec: Reconciliation }) {
  const columns = [
    misCol.accessor('type', {
      header: fr['payments.mis.type'],
      cell: (c) => <Badge tone="danger">{fr[`payments.mis.${c.getValue()}` as FrKey]}</Badge>,
    }),
    misCol.accessor('providerRef', {
      header: fr['payments.mis.ref'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    misCol.accessor((r) => r.orderNumber ?? '', {
      id: 'order',
      header: fr['payments.col.order'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue() || '—'}</span>,
    }),
    misCol.accessor((r) => r.providerStatus ?? '', {
      id: 'providerStatus',
      header: fr['payments.mis.providerStatus'],
      cell: (c) => c.getValue() || '—',
    }),
    misCol.accessor((r) => r.paymentStatus ?? '', {
      id: 'paymentStatus',
      header: fr['payments.mis.paymentStatus'],
      cell: (c) => (c.getValue() ? fr[`payments.status.${c.getValue()}` as FrKey] : '—'),
    }),
    misCol.accessor('providerAmountXof', {
      header: fr['payments.mis.providerAmount'],
      cell: (c) => <span className="whitespace-nowrap font-mono">{money(c.getValue())}</span>,
    }),
    misCol.accessor('paymentAmountXof', {
      header: fr['payments.mis.paymentAmount'],
      cell: (c) => <span className="whitespace-nowrap font-mono">{money(c.getValue())}</span>,
    }),
  ];
  return (
    <section aria-labelledby={`mis-${rec.id}`}>
      <h2 id={`mis-${rec.id}`} className="text-lg font-semibold">
        {fr['payments.mis.title']} · {rec.date} · {rec.provider}
      </h2>
      <div className="mt-2">
        <DataTable
          caption={`${fr['payments.mis.caption']} ${rec.date}`}
          columns={columns}
          data={rec.mismatches}
          getRowId={(r) => `${r.type}-${r.providerRef}`}
        />
      </div>
    </section>
  );
}
