import { useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  formatXof,
  ORDER_STATUS_LABELS_FR,
  type OrderStatus,
  type StatsSummary,
} from '@streetwear/shared';
import { colors } from '@streetwear/ui-tokens';
import { Button } from '../../components/button';
import { KpiCard } from '../../components/kpi-card';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { getStatsSummary, type StatsFilters } from '../../lib/stats-api';

const inputClass =
  'min-h-10 rounded-admin border border-borderStrong bg-surface px-3 text-sm text-ink';
const startOfDay = (d: string) => (d ? `${d}T00:00:00.000Z` : undefined);
const endOfDay = (d: string) => (d ? `${d}T23:59:59.999Z` : undefined);

const RECEPTION_LABELS: Record<string, FrKey> = {
  home: 'orders.reception.home',
  pickup: 'orders.reception.pickup',
};

export function DashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<StatsFilters>({});
  const stats = useQuery({
    queryKey: ['stats', 'summary', applied],
    queryFn: ({ signal }) => getStatsSummary(applied, signal),
    placeholderData: keepPreviousData,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setApplied({ from: startOfDay(from), to: endOfDay(to) });
  };

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['dashboard.title']}</h1>
      <form
        role="search"
        aria-label={fr['dashboard.period']}
        onSubmit={submit}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-admin-lg border border-border bg-surface p-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
          {fr['dashboard.from']}
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
          {fr['dashboard.to']}
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button type="submit">{fr['dashboard.apply']}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setFrom('');
            setTo('');
            setApplied({});
          }}
        >
          {fr['filter.reset']}
        </Button>
      </form>

      {stats.isPending && <p className="mt-4 text-sm text-inkSecondary">{fr['app.loading']}</p>}
      {stats.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {errorMessage(stats.error) || fr['dashboard.unavailable']}
        </p>
      )}
      {stats.data && <Indicators data={stats.data} />}
    </section>
  );
}

function Indicators({ data }: { data: StatsSummary }) {
  const statusRows = Object.entries(data.byStatus);
  const receptionRows = Object.entries(data.byReception);
  return (
    <div className="mt-6 space-y-6">
      <dl className="grid gap-4 sm:grid-cols-3">
        <KpiCard label={fr['dashboard.orders']} value={data.ordersCount} />
        <KpiCard label={fr['dashboard.revenue']} value={formatXof(data.revenueXof)} />
        <KpiCard label={fr['dashboard.average']} value={formatXof(data.averageOrderXof)} />
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownTable
          caption={fr['dashboard.byStatus']}
          rows={statusRows.map(([k, v]) => [ORDER_STATUS_LABELS_FR[k as OrderStatus] ?? k, v])}
        />
        <BreakdownTable
          caption={fr['dashboard.byReception']}
          rows={receptionRows.map(([k, v]) => [
            RECEPTION_LABELS[k] ? fr[RECEPTION_LABELS[k]] : k,
            v,
          ])}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RankChart
          title={fr['dashboard.topPatterns']}
          empty={fr['dashboard.topPatterns.empty']}
          items={data.topPatterns}
          color={colors.ink}
        />
        <RankChart
          title={fr['dashboard.topColors']}
          empty={fr['dashboard.topColors.empty']}
          items={data.topColors}
          color={colors.inkSecondary}
        />
      </div>
    </div>
  );
}

function BreakdownTable({ caption, rows }: { caption: string; rows: [string, number][] }) {
  return (
    <div
      className="overflow-x-auto rounded-admin-lg border border-border bg-surface"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="w-full min-w-64 border-collapse text-left text-sm">
        <caption className="px-4 py-3 text-left text-sm font-medium">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-inkSecondary">
            <th scope="col" className="px-4 py-2 font-medium">
              {fr['dashboard.col.label']}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              {fr['dashboard.col.count']}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-inkSecondary">
                {fr['table.empty']}
              </td>
            </tr>
          )}
          {rows.map(([label, count]) => (
            <tr key={label} className="border-b border-border last:border-0">
              <td className="px-4 py-2">{label}</td>
              <td className="px-4 py-2 text-right font-mono">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankChart({
  title,
  empty,
  items,
  color,
}: {
  title: string;
  empty: string;
  items: { id: string; name: string; count: number }[];
  color: string;
}) {
  return (
    <section className="rounded-admin-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-inkSecondary">{empty}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${title} : ${items.map((i) => `${i.name} ${i.count}`).join(', ')}`}
            className="mt-3 h-56 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={items} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={colors.border} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: colors.inkSecondary, fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fill: colors.ink, fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="count" name={fr['dashboard.col.count']} fill={color} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="mt-3 space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>{i.name}</span>
                <span className="font-mono">{i.count}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
