import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { listStores, type AdminStore } from '../../lib/logistics-api';
import { SlotsPanel } from './slots-panel';
import { StoreForm } from './store-form';

const col = createColumnHelper<AdminStore>();

export function PickupPage() {
  const q = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const [editing, setEditing] = useState<AdminStore | 'new' | null>(null);
  const [slotsFor, setSlotsFor] = useState<string | null>(null);
  const stores = q.data ?? [];
  const slotStore = stores.find((s) => s.id === slotsFor) ?? null;

  const columns = [
    col.accessor('name', { header: fr['stores.name'] }),
    col.accessor('address', { header: fr['stores.address'] }),
    col.display({
      id: 'hours',
      header: fr['stores.hours'],
      cell: (c) => (
        <ul className="font-mono text-xs">
          {Object.entries(c.row.original.openingHours).map(([days, h]) => (
            <li key={days}>
              {days} : {h}
            </li>
          ))}
        </ul>
      ),
    }),
    col.accessor('defaultSlotCapacity', {
      header: fr['stores.defaultCapacity'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    col.accessor('active', {
      header: fr['stores.active'],
      cell: (c) => fr[c.getValue() ? 'zones.active.yes' : 'zones.active.no'],
    }),
    col.display({
      id: 'actions',
      header: fr['deliveries.col.action'],
      enableSorting: false,
      cell: (c) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            aria-label={`${fr['stores.edit']} ${c.row.original.name}`}
            onClick={() => setEditing(c.row.original)}
          >
            {fr['stores.edit']}
          </Button>
          <Button
            variant="secondary"
            aria-label={`${fr['stores.slots']} ${c.row.original.name}`}
            onClick={() => setSlotsFor(c.row.original.id)}
          >
            {fr['stores.slots']}
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] font-semibold leading-10">{fr['nav.pickup']}</h1>
        <Button onClick={() => setEditing('new')}>{fr['stores.add']}</Button>
      </div>
      <p className="mb-4 mt-1 text-sm text-inkSecondary">{fr['pickup.subtitle']}</p>
      {q.error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(q.error)}
        </p>
      )}
      {q.isPending ? (
        <p className="text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <DataTable
          caption={fr['stores.caption']}
          columns={columns}
          data={stores}
          getRowId={(r) => r.id}
          emptyMessage={fr['stores.empty']}
        />
      )}
      {editing && (
        <StoreForm
          key={editing === 'new' ? 'new' : editing.id}
          store={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {slotStore && <SlotsPanel key={slotStore.id} store={slotStore} />}
    </section>
  );
}
