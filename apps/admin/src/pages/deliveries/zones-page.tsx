import { useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { formatXof } from '@streetwear/shared';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { errorClass, inputClass, labelClass } from '../../components/form-classes';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { parseGeoJson } from '../../lib/geojson';
import {
  createZone,
  listZones,
  updateZone,
  type AdminZone,
  type GeoPolygon,
} from '../../lib/logistics-api';
import { DeliveriesTabs } from './deliveries-page';
import { ZoneMap } from './zone-map';

const col = createColumnHelper<AdminZone>();

function ZoneForm({ zone, onDone }: { zone: AdminZone | null; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileId = useId();
  const [name, setName] = useState(zone?.name ?? '');
  const [fee, setFee] = useState(zone ? String(zone.feeXof) : '');
  const [delay, setDelay] = useState(zone ? String(zone.delayHours) : '');
  const [active, setActive] = useState(zone?.active ?? true);
  const [geoText, setGeoText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const geo = useMemo(() => (geoText.trim() ? parseGeoJson(geoText) : null), [geoText]);
  const preview: GeoPolygon | null = geo?.ok ? geo.polygon : (zone?.polygon ?? null);

  const feeN = Number(fee);
  const delayN = Number(delay);
  const errors = {
    name: name.trim() ? null : fr['zones.error.name'],
    fee: fee !== '' && Number.isInteger(feeN) && feeN >= 0 ? null : fr['zones.error.fee'],
    delay:
      delay !== '' && Number.isInteger(delayN) && delayN >= 0 && delayN <= 720
        ? null
        : fr['zones.error.delay'],
    geo:
      geo && !geo.ok
        ? fr[`zones.geo.error.${geo.error}` as FrKey]
        : !zone && !geo
          ? fr['zones.geo.required']
          : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const base = { name: name.trim(), feeXof: feeN, delayHours: delayN, active };
      const polygon = geo?.ok ? geo.polygon : undefined;
      return zone
        ? updateZone(zone.id, { ...base, ...(polygon && { polygon }) })
        : createZone({ ...base, polygon: polygon as GeoPolygon });
    },
    onSuccess: () => {
      toast.show(fr[zone ? 'zones.updated' : 'zones.created'], 'success');
      void qc.invalidateQueries({ queryKey: ['zones'] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!invalid) save.mutate();
  };
  const readFile = (file: File | undefined) => {
    if (file) void file.text().then(setGeoText);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={fr[zone ? 'zones.form.edit' : 'zones.form.create']}
      className="mt-4 rounded-admin-lg border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">
        {fr[zone ? 'zones.form.edit' : 'zones.form.create']}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className={labelClass}>
          {fr['zones.col.name']}
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={submitted && !!errors.name}
          />
          {submitted && errors.name && <span className={errorClass}>{errors.name}</span>}
        </label>
        <label className={labelClass}>
          {fr['zones.col.fee']}
          <input
            className={`${inputClass} font-mono`}
            inputMode="numeric"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            aria-invalid={submitted && !!errors.fee}
          />
          {submitted && errors.fee && <span className={errorClass}>{errors.fee}</span>}
        </label>
        <label className={labelClass}>
          {fr['zones.col.delay']}
          <input
            className={`${inputClass} font-mono`}
            inputMode="numeric"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            aria-invalid={submitted && !!errors.delay}
          />
          {submitted && errors.delay && <span className={errorClass}>{errors.delay}</span>}
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {fr['zones.col.active']}
      </label>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={fileId} className="block text-xs font-medium text-inkSecondary">
            {fr['zones.geo.file']}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={(e) => readFile(e.target.files?.[0])}
            className="mt-1 block w-full text-sm"
          />
          <label className={`${labelClass} mt-3`}>
            {fr['zones.geo.paste']}
            <textarea
              rows={8}
              spellCheck={false}
              value={geoText}
              onChange={(e) => setGeoText(e.target.value)}
              aria-invalid={!!errors.geo && (submitted || !!geo)}
              className={`${inputClass} py-2 font-mono text-xs`}
            />
          </label>
          {zone && !geo && <p className="mt-1 text-xs text-inkSecondary">{fr['zones.geo.keep']}</p>}
          {errors.geo && (submitted || geo) && (
            <p role="alert" className={`mt-1 ${errorClass}`}>
              {errors.geo}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-inkSecondary">{fr['zones.map.title']}</p>
          <ZoneMap polygon={preview} />
          {geo?.ok && <p className="mt-1 text-xs text-inkSecondary">{fr['zones.geo.valid']}</p>}
        </div>
      </div>

      {save.error && (
        <p role="alert" className={`mt-3 ${errorClass}`}>
          {errorMessage(save.error)}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {fr['zones.save']}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {fr['dialog.cancel']}
        </Button>
      </div>
    </form>
  );
}

export function ZonesPage() {
  const q = useQuery({ queryKey: ['zones'], queryFn: listZones });
  const [editing, setEditing] = useState<AdminZone | 'new' | null>(null);

  const columns = [
    col.accessor('name', { header: fr['zones.col.name'] }),
    col.accessor('feeXof', {
      header: fr['zones.col.fee'],
      cell: (c) => <span className="whitespace-nowrap font-mono">{formatXof(c.getValue())}</span>,
    }),
    col.accessor('delayHours', {
      header: fr['zones.col.delay'],
      cell: (c) => <span className="font-mono">{c.getValue()} h</span>,
    }),
    col.accessor('active', {
      header: fr['zones.col.active'],
      cell: (c) => fr[c.getValue() ? 'zones.active.yes' : 'zones.active.no'],
    }),
    col.display({
      id: 'actions',
      header: fr['deliveries.col.action'],
      enableSorting: false,
      cell: (c) => (
        <Button
          variant="secondary"
          aria-label={`${fr['zones.edit']} ${c.row.original.name}`}
          onClick={() => setEditing(c.row.original)}
        >
          {fr['zones.edit']}
        </Button>
      ),
    }),
  ];

  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['nav.deliveries']}</h1>
      <div className="mt-4">
        <DeliveriesTabs />
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{fr['zones.title']}</h2>
        <Button onClick={() => setEditing('new')}>{fr['zones.add']}</Button>
      </div>
      {q.error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(q.error)}
        </p>
      )}
      {q.isPending ? (
        <p className="text-sm text-inkSecondary">{fr['app.loading']}</p>
      ) : (
        <DataTable
          caption={fr['zones.caption']}
          columns={columns}
          data={q.data ?? []}
          getRowId={(r) => r.id}
          emptyMessage={fr['zones.empty']}
        />
      )}
      {editing && (
        <ZoneForm
          key={editing === 'new' ? 'new' : editing.id}
          zone={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
    </section>
  );
}
