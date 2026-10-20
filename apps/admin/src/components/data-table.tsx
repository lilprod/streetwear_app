import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { fr } from '../i18n/fr';
import { Button } from './button';

export type DataTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack: valeurs de colonnes hétérogènes
  columns: ColumnDef<T, any>[];
  data: T[];
  caption: string;
  getRowId?: (row: T) => string;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  emptyMessage?: string;
};

export function DataTable<T>({
  columns,
  data,
  caption,
  getRowId,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
  emptyMessage = fr['table.empty'],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const showPager = !!(onPrevious || onNext);

  return (
    <div className="rounded-admin-lg border border-border bg-surface">
      <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const label = flexRender(h.column.columnDef.header, h.getContext());
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className="px-4 py-3 text-xs font-medium text-inkSecondary"
                    >
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded-admin"
                        >
                          {label}
                          <span aria-hidden="true">
                            {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
                          </span>
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-inkSecondary">{emptyMessage}</p>
        )}
      </div>
      {showPager && (
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <Button variant="secondary" disabled={!hasPrevious} onClick={onPrevious}>
            {fr['table.previous']}
          </Button>
          <Button variant="secondary" disabled={!hasNext} onClick={onNext}>
            {fr['table.next']}
          </Button>
        </div>
      )}
    </div>
  );
}

export function useCursorPager(nextCursor: string | null | undefined) {
  const [stack, setStack] = useState<string[]>([]);
  return {
    cursor: stack[stack.length - 1],
    hasPrevious: stack.length > 0,
    hasNext: !!nextCursor,
    next: () => nextCursor && setStack((s) => [...s, nextCursor]),
    previous: () => setStack((s) => s.slice(0, -1)),
    reset: () => setStack([]),
  };
}
