import { useQuery } from '@tanstack/react-query';
import { formatXof, type StatsSummary } from '@streetwear/shared';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { fr } from '../i18n/fr';
import { KpiCard } from '../components/kpi-card';

export function DashboardPage() {
  const { data, error, isPending } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => api<StatsSummary>('/admin/stats/summary'),
  });

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['dashboard.title']}</h1>
      {isPending && <p className="mt-4 text-sm text-inkSecondary">{fr['app.loading']}</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
      {data && (
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <KpiCard label={fr['dashboard.orders']} value={data.ordersCount} />
          <KpiCard label={fr['dashboard.revenue']} value={formatXof(data.revenueXof)} />
          <KpiCard label={fr['dashboard.average']} value={formatXof(data.averageOrderXof)} />
        </dl>
      )}
    </section>
  );
}
