import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { formatLome } from '@streetwear/shared';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { JobBadge } from '../../components/job-badge';
import { OperatorSelect, useOperatorChoice } from '../../components/operator-select';
import { StatusBadge } from '../../components/status-badge';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import {
  assignOperator,
  getOrder,
  getProductionQueue,
  type ProductionQueueItem,
  type ProductionQueueStatus,
} from '../../lib/orders-api';
import { useOrderCacheUpdate } from '../orders/transition-panel';
import { PrintFilesPanel } from './print-files-panel';
import { SheetButton } from './sheet-button';

const col = createColumnHelper<ProductionQueueItem>();

function useQueue(status: ProductionQueueStatus) {
  const q = useInfiniteQuery({
    queryKey: ['production-queue', status],
    queryFn: ({ signal, pageParam }) => getProductionQueue(status, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return { q, rows: q.data?.pages.flatMap((p) => p.items) ?? [] };
}

export function ProductionPage() {
  const toast = useToast();
  const update = useOrderCacheUpdate();
  const choice = useOperatorChoice();
  const [filesFor, setFilesFor] = useState<string | null>(null);

  const toAssign = useQueue('to_assign');
  const inProgress = useQueue('in_production');
  const failed = toAssign.q.error ?? inProgress.q.error;
  const loading = toAssign.q.isPending || inProgress.q.isPending;

  const assign = useMutation({
    mutationFn: ({ id }: { id: string; re: boolean }) => assignOperator(id, choice.value),
    onSuccess: (order, vars) => {
      update(order);
      toast.show(fr[vars.re ? 'production.reassigned' : 'production.assigned'], 'success');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const detail = useQuery({
    queryKey: ['order', filesFor],
    queryFn: () => getOrder(filesFor ?? ''),
    enabled: !!filesFor,
  });

  const columns = (re: boolean) => [
    col.accessor('orderNumber', {
      header: fr['orders.col.number'],
      cell: (c) => (
        <Link
          to={`/commandes/${c.row.original.orderId}`}
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
    col.accessor('itemsCount', {
      header: fr['orders.col.items'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    col.accessor('receptionType', {
      header: fr['orders.col.reception'],
      cell: (c) => fr[`orders.reception.${c.getValue()}` as FrKey],
    }),
    col.accessor('paidAt', {
      header: fr['production.col.paidAt'],
      cell: (c) => <span className="whitespace-nowrap font-mono">{formatLome(c.getValue())}</span>,
    }),
    col.display({
      id: 'operator',
      header: fr['production.col.operator'],
      enableSorting: false,
      cell: (c) =>
        c.row.original.production?.operator?.name ?? (
          <span className="text-inkSecondary">{fr['production.unassigned']}</span>
        ),
    }),
    col.display({
      id: 'job',
      header: fr['production.col.job'],
      enableSorting: false,
      cell: (c) => <JobBadge status={c.row.original.production?.status ?? null} />,
    }),
    col.display({
      id: 'actions',
      header: fr['production.col.action'],
      enableSorting: false,
      cell: (c) => {
        const o = c.row.original;
        const label = fr[re ? 'production.reassign' : 'production.assign'];
        return (
          <div className="flex gap-2">
            <Button
              disabled={assign.isPending || !choice.value}
              aria-label={`${label} ${o.orderNumber}`}
              onClick={() => assign.mutate({ id: o.orderId, re })}
            >
              {label}
            </Button>
            <Button
              variant="secondary"
              aria-label={`${fr['production.files']} ${o.orderNumber}`}
              onClick={() => setFilesFor(o.orderId)}
            >
              {fr['production.files']}
            </Button>
            <SheetButton orderId={o.orderId} orderNumber={o.orderNumber} />
          </div>
        );
      },
    }),
  ];

  const block = (
    title: string,
    caption: string,
    queue: ReturnType<typeof useQueue>,
    re: boolean,
  ) => (
    <section aria-label={title} className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">
        {title} <span className="font-mono text-sm text-inkSecondary">{queue.rows.length}</span>
      </h2>
      <DataTable
        caption={caption}
        columns={columns(re)}
        data={queue.rows}
        getRowId={(r) => r.orderId}
        emptyMessage={fr['production.empty']}
      />
      {queue.q.hasNextPage && (
        <div className="mt-2">
          <Button
            variant="secondary"
            disabled={queue.q.isFetchingNextPage}
            aria-label={`${fr['production.loadMore']} (${title})`}
            onClick={() => void queue.q.fetchNextPage()}
          >
            {fr['production.loadMore']}
          </Button>
        </div>
      )}
    </section>
  );

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['production.title']}</h1>
      <p className="mt-1 text-sm text-inkSecondary">{fr['production.subtitle']}</p>
      <div className="mt-4 max-w-xs">
        <OperatorSelect choice={choice} hint={fr['production.operator.hint']} />
      </div>
      {failed && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {fr['production.loadError']} {errorMessage(failed)}
        </p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <>
          {block(fr['production.toAssign'], fr['production.caption.toAssign'], toAssign, false)}
          {block(
            fr['production.inProgress'],
            fr['production.caption.inProgress'],
            inProgress,
            true,
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
