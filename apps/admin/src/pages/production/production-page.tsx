import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { formatLome, type OrderStatus } from '@streetwear/shared';
import { useAuth } from '../../auth/auth-context';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { StatusBadge } from '../../components/status-badge';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { assignOperator, getOrder, listOrders, type AdminOrderSummary } from '../../lib/orders-api';
import { useOrderCacheUpdate } from '../orders/transition-panel';
import { PrintFilesPanel } from './print-files-panel';
import { SheetButton } from './sheet-button';

const col = createColumnHelper<AdminOrderSummary>();
const TO_ASSIGN: OrderStatus[] = ['paid', 'deposit_paid'];
const IN_PROGRESS: OrderStatus[] = ['in_production'];

export function ProductionPage() {
  const { session } = useAuth();
  const toast = useToast();
  const update = useOrderCacheUpdate();
  const [filesFor, setFilesFor] = useState<string | null>(null);

  const results = useQueries({
    queries: [...TO_ASSIGN, ...IN_PROGRESS].map((status) => ({
      queryKey: ['production-queue', status],
      queryFn: ({ signal }: { signal: AbortSignal }) => listOrders({ status }, signal, 100),
    })),
  });
  const failed = results.find((r) => r.error);
  const loading = results.some((r) => r.isPending);
  const byTime = (a: AdminOrderSummary, b: AdminOrderSummary) =>
    a.createdAt.localeCompare(b.createdAt);
  const toAssign = results
    .slice(0, TO_ASSIGN.length)
    .flatMap((r) => r.data?.items ?? [])
    .sort(byTime);
  const inProgress = results
    .slice(TO_ASSIGN.length)
    .flatMap((r) => r.data?.items ?? [])
    .sort(byTime);

  const assign = useMutation({
    mutationFn: (id: string) => assignOperator(id, session?.userId ?? ''),
    onSuccess: (order) => {
      update(order);
      toast.show(fr['production.assigned'], 'success');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const detail = useQuery({
    queryKey: ['order', filesFor],
    queryFn: () => getOrder(filesFor ?? ''),
    enabled: !!filesFor,
  });

  const columns = (withAssign: boolean) => [
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
    col.accessor('status', {
      header: fr['orders.col.status'],
      cell: (c) => <StatusBadge status={c.getValue()} />,
    }),
    col.accessor('itemCount', {
      header: fr['orders.col.items'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    col.accessor('receptionType', {
      header: fr['orders.col.reception'],
      cell: (c) => fr[`orders.reception.${c.getValue()}` as FrKey],
    }),
    col.accessor('createdAt', {
      header: fr['orders.col.date'],
      cell: (c) => <span className="whitespace-nowrap font-mono">{formatLome(c.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      header: fr['production.col.action'],
      enableSorting: false,
      cell: (c) => {
        const o = c.row.original;
        return (
          <div className="flex gap-2">
            {withAssign && (
              <Button
                disabled={assign.isPending}
                aria-label={`${fr['production.assignMe']} ${o.number}`}
                onClick={() => assign.mutate(o.id)}
              >
                {fr['production.assignMe']}
              </Button>
            )}
            <Button
              variant="secondary"
              aria-label={`${fr['production.files']} ${o.number}`}
              onClick={() => setFilesFor(o.id)}
            >
              {fr['production.files']}
            </Button>
            <SheetButton orderId={o.id} orderNumber={o.number} />
          </div>
        );
      },
    }),
  ];

  const block = (
    title: string,
    caption: string,
    rows: AdminOrderSummary[],
    withAssign: boolean,
  ) => (
    <section aria-label={title} className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">
        {title} <span className="font-mono text-sm text-inkSecondary">{rows.length}</span>
      </h2>
      <DataTable
        caption={caption}
        columns={columns(withAssign)}
        data={rows}
        getRowId={(r) => r.id}
        emptyMessage={fr['production.empty']}
      />
    </section>
  );

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['production.title']}</h1>
      <p className="mt-1 text-sm text-inkSecondary">{fr['production.subtitle']}</p>
      {failed && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {fr['production.loadError']} {errorMessage(failed.error)}
        </p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <>
          {block(fr['production.toAssign'], fr['production.caption.toAssign'], toAssign, true)}
          {block(
            fr['production.inProgress'],
            fr['production.caption.inProgress'],
            inProgress,
            false,
          )}
        </>
      )}
      {filesFor && detail.data && (
        <PrintFilesPanel order={detail.data} onClose={() => setFilesFor(null)} />
      )}
      {filesFor && detail.error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {errorMessage(detail.error)}
        </p>
      )}
    </section>
  );
}
