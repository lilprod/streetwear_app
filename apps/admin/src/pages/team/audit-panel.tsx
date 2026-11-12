import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { formatLome } from '@streetwear/shared';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { TextField } from '../../components/field';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { useCursorStack } from '../../lib/paging';
import { listAuditLogs, type AuditEntry, type AuditFilters } from '../../lib/team-api';

const col = createColumnHelper<AuditEntry>();

const json = (v: unknown): string =>
  v === null || v === undefined ? '—' : JSON.stringify(v, null, 2);

export function AuditPanel() {
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [applied, setApplied] = useState<AuditFilters>({});
  const pager = useCursorStack();
  const list = useQuery({
    queryKey: ['team', 'audit', JSON.stringify(applied), pager.cursor ?? null],
    queryFn: ({ signal }) => listAuditLogs(applied, pager.cursor, signal),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setApplied({
      entity: entity.trim() || undefined,
      entityId: entityId.trim() || undefined,
    });
    pager.reset();
  };

  const columns = [
    col.accessor('createdAt', {
      header: fr['audit.col.date'],
      cell: (c) => (
        <span className="whitespace-nowrap font-mono text-xs">{formatLome(c.getValue())}</span>
      ),
    }),
    col.accessor((r) => r.adminEmail ?? '—', {
      id: 'admin',
      header: fr['audit.col.admin'],
    }),
    col.accessor('action', { header: fr['audit.col.action'] }),
    col.accessor('entity', {
      header: fr['audit.col.entity'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    col.accessor((r) => r.entityId ?? '', {
      id: 'entityId',
      header: fr['audit.col.entityId'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue() || '—'}</span>,
    }),
    col.display({
      id: 'changes',
      header: fr['audit.col.changes'],
      enableSorting: false,
      cell: (c) => (
        <details>
          <summary className="cursor-pointer text-sm underline underline-offset-2">
            {fr['audit.changes.show']}
            <span className="sr-only"> {c.row.original.id}</span>
          </summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-inkSecondary">{fr['audit.before']}</p>
              <pre className="max-h-40 overflow-auto rounded-admin border border-border p-2 text-xs">
                {json(c.row.original.before)}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-inkSecondary">{fr['audit.after']}</p>
              <pre className="max-h-40 overflow-auto rounded-admin border border-border p-2 text-xs">
                {json(c.row.original.after)}
              </pre>
            </div>
          </div>
        </details>
      ),
    }),
  ];

  return (
    <section aria-labelledby="audit-title" className="mt-4">
      <h2 id="audit-title" className="text-lg font-semibold">
        {fr['audit.title']}
      </h2>
      <form
        role="search"
        aria-label={fr['audit.filter.label']}
        onSubmit={submit}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-admin-lg border border-border bg-surface p-3"
      >
        <div className="min-w-48 flex-1">
          <TextField
            label={fr['audit.filter.entity']}
            hint={fr['audit.filter.entityHint']}
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="min-w-48 flex-1">
          <TextField
            label={fr['audit.filter.entityId']}
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            maxLength={100}
          />
        </div>
        <Button type="submit">{fr['filter.apply']}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setEntity('');
            setEntityId('');
            setApplied({});
            pager.reset();
          }}
        >
          {fr['filter.reset']}
        </Button>
      </form>
      {list.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage(list.error)}
        </p>
      )}
      <div className="mt-4">
        <DataTable
          caption={fr['audit.caption']}
          columns={columns}
          data={list.data?.items ?? []}
          getRowId={(r) => r.id}
          {...pager.pagerProps(list.data?.nextCursor)}
        />
      </div>
    </section>
  );
}
