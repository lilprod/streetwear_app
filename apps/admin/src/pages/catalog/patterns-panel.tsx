import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { DataTable } from '../../components/data-table';
import { Badge } from '../../components/field';
import { FilterBar } from '../../components/filter-bar';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { useCursorStack } from '../../lib/paging';
import { reasonMessages } from '../../lib/reasons';
import {
  listCategories,
  listPatterns,
  updatePattern,
  type CatalogPattern,
} from '../../lib/catalog-api';
import { PatternForm } from './pattern-form';

const col = createColumnHelper<CatalogPattern>();

export function PatternsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CatalogPattern | 'new' | null>(null);
  const [toDisable, setToDisable] = useState<CatalogPattern | null>(null);
  const pager = useCursorStack();
  const list = useQuery({
    queryKey: ['catalog', 'patterns', q, pager.cursor ?? null],
    queryFn: ({ signal }) => listPatterns(q, pager.cursor, signal),
  });
  const categories = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => listCategories(),
  });
  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? '—';

  const toggle = useMutation({
    mutationFn: (p: CatalogPattern) => updatePattern(p.id, { active: !p.active }),
    onSuccess: (p) => {
      toast.show(p.active ? fr['catalog.pattern.activated'] : fr['catalog.pattern.deactivated']);
      void qc.invalidateQueries({ queryKey: ['catalog', 'patterns'] });
    },
    onError: (err) => toast.show(reasonMessages(err, 'catalog.reason').join(' '), 'error'),
    onSettled: () => setToDisable(null),
  });

  const columns = [
    col.accessor('thumbnailUrl', {
      header: fr['catalog.col.preview'],
      enableSorting: false,
      cell: (c) => (
        <img
          src={c.getValue()}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 rounded-admin border border-border object-cover"
        />
      ),
    }),
    col.accessor('name', {
      header: fr['catalog.col.name'],
      cell: (c) => (
        <div>
          <div className="font-medium">{c.getValue()}</div>
          <div className="text-xs text-inkSecondary">{c.row.original.origin || '—'}</div>
        </div>
      ),
    }),
    col.accessor((r) => categoryName(r.categoryId), {
      id: 'category',
      header: fr['catalog.col.category'],
    }),
    col.accessor('priceTier', {
      header: fr['catalog.col.tier'],
      cell: (c) => fr[`catalog.tier.${c.getValue()}`],
    }),
    col.accessor((r) => `${r.widthPx} × ${r.heightPx}`, {
      id: 'size',
      header: fr['catalog.col.size'],
      cell: (c) => <span className="whitespace-nowrap font-mono text-xs">{c.getValue()} px</span>,
    }),
    col.accessor('rightsHolder', {
      header: fr['catalog.col.rights'],
      cell: (c) =>
        c.getValue() ? (
          <span>{c.getValue()}</span>
        ) : (
          <Badge tone="danger">{fr['catalog.rights.missing']}</Badge>
        ),
    }),
    col.accessor('active', {
      header: fr['catalog.col.status'],
      cell: (c) => (
        <Badge tone={c.getValue() ? 'on' : 'off'}>
          {c.getValue() ? fr['catalog.status.active'] : fr['catalog.status.inactive']}
        </Badge>
      ),
    }),
    col.display({
      id: 'actions',
      header: fr['catalog.col.actions'],
      enableSorting: false,
      cell: (c) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(c.row.original)}>
            {fr['catalog.action.edit']}
            <span className="sr-only"> {c.row.original.name}</span>
          </Button>
          <Button
            variant="secondary"
            disabled={toggle.isPending}
            onClick={() =>
              c.row.original.active ? setToDisable(c.row.original) : toggle.mutate(c.row.original)
            }
          >
            {c.row.original.active
              ? fr['catalog.action.deactivate']
              : fr['catalog.action.activate']}
            <span className="sr-only"> {c.row.original.name}</span>
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <section aria-labelledby="patterns-title" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="patterns-title" className="text-lg font-semibold">
          {fr['catalog.patterns.title']}
        </h2>
        <Button onClick={() => setEditing('new')}>{fr['catalog.pattern.add']}</Button>
      </div>
      {editing && (
        <PatternForm
          pattern={editing === 'new' ? undefined : editing}
          categories={categories.data ?? []}
          onDone={() => setEditing(null)}
        />
      )}
      <div className="mt-4">
        <FilterBar
          searchLabel={fr['catalog.search']}
          search={search}
          onSearchChange={setSearch}
          onSubmit={() => {
            setQ(search.trim());
            pager.reset();
          }}
          onReset={() => {
            setSearch('');
            setQ('');
            pager.reset();
          }}
        />
      </div>
      {list.isError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      <DataTable
        caption={fr['catalog.patterns.caption']}
        columns={columns}
        data={list.data?.items ?? []}
        getRowId={(r) => r.id}
        {...pager.pagerProps(list.data?.nextCursor)}
      />
      <ConfirmDialog
        open={toDisable !== null}
        title={fr['catalog.confirm.deactivate.title']}
        confirmLabel={fr['catalog.action.deactivate']}
        destructive
        onCancel={() => setToDisable(null)}
        onConfirm={() => toDisable && toggle.mutate(toDisable)}
      >
        <p>{fr['catalog.confirm.deactivate.body']}</p>
      </ConfirmDialog>
    </section>
  );
}
