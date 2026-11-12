import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { Badge, CheckField, TextField } from '../../components/field';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { reasonMessages } from '../../lib/reasons';
import {
  createCategory,
  createColor,
  listCategories,
  listColors,
  updateCategory,
  updateColor,
  type PatternCategory,
  type TshirtColor,
} from '../../lib/catalog-api';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const catCol = createColumnHelper<PatternCategory>();
const colorCol = createColumnHelper<TshirtColor>();

function useFormToast() {
  const toast = useToast();
  return (err: unknown) => toast.show(reasonMessages(err, 'catalog.reason').join(' '), 'error');
}

export function CategoriesPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const onError = useFormToast();
  const list = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => listCategories() });
  const [editing, setEditing] = useState<PatternCategory | null>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('0');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setEditing(null);
    setSlug('');
    setName('');
    setPosition('0');
    setErrors({});
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { slug, name: name.trim(), position: Number(position) };
      return editing ? updateCategory(editing.id, body) : createCategory(body);
    },
    onSuccess: () => {
      toast.show(fr['catalog.saved']);
      reset();
      void qc.invalidateQueries({ queryKey: ['catalog', 'categories'] });
    },
    onError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!SLUG.test(slug)) next.slug = fr['catalog.category.slugFormat'];
    if (!name.trim()) next.name = fr['catalog.form.nameRequired'];
    if (!Number.isInteger(Number(position)) || Number(position) < 0) {
      next.position = fr['catalog.form.positionFormat'];
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };
  const edit = (c: PatternCategory) => {
    setEditing(c);
    setSlug(c.slug);
    setName(c.name);
    setPosition(String(c.position));
  };

  const columns = [
    catCol.accessor('name', { header: fr['catalog.col.name'] }),
    catCol.accessor('slug', {
      header: fr['catalog.category.slug'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    catCol.accessor('position', {
      header: fr['catalog.col.position'],
      cell: (c) => <span className="font-mono">{c.getValue()}</span>,
    }),
    catCol.display({
      id: 'actions',
      header: fr['catalog.col.actions'],
      enableSorting: false,
      cell: (c) => (
        <Button variant="secondary" onClick={() => edit(c.row.original)}>
          {fr['catalog.action.edit']}
          <span className="sr-only"> {c.row.original.name}</span>
        </Button>
      ),
    }),
  ];

  return (
    <section aria-labelledby="categories-title" className="mt-4">
      <h2 id="categories-title" className="text-lg font-semibold">
        {fr['catalog.categories.title']}
      </h2>
      <form
        onSubmit={submit}
        noValidate
        aria-label={editing ? fr['catalog.category.edit'] : fr['catalog.category.new']}
        className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-3"
      >
        <TextField
          label={fr['catalog.category.slug']}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          error={errors.slug}
          maxLength={60}
        />
        <TextField
          label={fr['catalog.form.name']}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={100}
        />
        <TextField
          label={fr['catalog.col.position']}
          type="number"
          min={0}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          error={errors.position}
        />
        <div className="flex flex-wrap gap-3 md:col-span-3">
          <Button type="submit" disabled={save.isPending}>
            {editing ? fr['catalog.form.save'] : fr['catalog.category.add']}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={reset}>
              {fr['catalog.form.cancel']}
            </Button>
          )}
        </div>
      </form>
      <div className="mt-4">
        <DataTable
          caption={fr['catalog.categories.caption']}
          columns={columns}
          data={list.data ?? []}
          getRowId={(r) => r.id}
        />
      </div>
    </section>
  );
}

export function ColorsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const onError = useFormToast();
  const list = useQuery({ queryKey: ['catalog', 'colors'], queryFn: () => listColors() });
  const [editing, setEditing] = useState<TshirtColor | null>(null);
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#');
  const [isDark, setIsDark] = useState(false);
  const [active, setActive] = useState(true);
  const [position, setPosition] = useState('0');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setEditing(null);
    setName('');
    setHex('#');
    setIsDark(false);
    setActive(true);
    setPosition('0');
    setErrors({});
  };
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['catalog', 'colors'] });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        hex,
        isDark,
        active,
        position: Number(position),
      };
      return editing ? updateColor(editing.id, body) : createColor(body);
    },
    onSuccess: () => {
      toast.show(fr['catalog.saved']);
      reset();
      invalidate();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (c: TshirtColor) => updateColor(c.id, { active: !c.active }),
    onSuccess: invalidate,
    onError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = fr['catalog.form.nameRequired'];
    if (!HEX.test(hex)) next.hex = fr['catalog.color.hexFormat'];
    if (!Number.isInteger(Number(position)) || Number(position) < 0) {
      next.position = fr['catalog.form.positionFormat'];
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };
  const edit = (c: TshirtColor) => {
    setEditing(c);
    setName(c.name);
    setHex(c.hex);
    setIsDark(c.isDark);
    setActive(c.active);
    setPosition(String(c.position));
  };

  const columns = [
    colorCol.accessor('hex', {
      header: fr['catalog.color.swatch'],
      enableSorting: false,
      cell: (c) => (
        <span
          aria-hidden="true"
          className="inline-block h-6 w-6 rounded-admin border border-border"
          style={{ backgroundColor: c.getValue() }}
        />
      ),
    }),
    colorCol.accessor('name', { header: fr['catalog.col.name'] }),
    colorCol.accessor('hex', {
      id: 'hexText',
      header: fr['catalog.color.hex'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    colorCol.accessor('isDark', {
      header: fr['catalog.color.dark'],
      cell: (c) => (c.getValue() ? fr['common.yes'] : fr['common.no']),
    }),
    colorCol.accessor('active', {
      header: fr['catalog.col.status'],
      cell: (c) => (
        <Badge tone={c.getValue() ? 'on' : 'off'}>
          {c.getValue() ? fr['catalog.status.active'] : fr['catalog.status.inactive']}
        </Badge>
      ),
    }),
    colorCol.display({
      id: 'actions',
      header: fr['catalog.col.actions'],
      enableSorting: false,
      cell: (c) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => edit(c.row.original)}>
            {fr['catalog.action.edit']}
            <span className="sr-only"> {c.row.original.name}</span>
          </Button>
          <Button
            variant="secondary"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(c.row.original)}
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
    <section aria-labelledby="colors-title" className="mt-4">
      <h2 id="colors-title" className="text-lg font-semibold">
        {fr['catalog.colors.title']}
      </h2>
      <form
        onSubmit={submit}
        noValidate
        aria-label={editing ? fr['catalog.color.edit'] : fr['catalog.color.new']}
        className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-3"
      >
        <TextField
          label={fr['catalog.form.name']}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={100}
        />
        <TextField
          label={fr['catalog.color.hex']}
          hint={fr['catalog.color.hexHint']}
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          error={errors.hex}
          maxLength={7}
        />
        <TextField
          label={fr['catalog.col.position']}
          type="number"
          min={0}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          error={errors.position}
        />
        <CheckField label={fr['catalog.color.dark']} checked={isDark} onChange={setIsDark} />
        <CheckField label={fr['catalog.form.active']} checked={active} onChange={setActive} />
        <div className="flex flex-wrap gap-3 md:col-span-3">
          <Button type="submit" disabled={save.isPending}>
            {editing ? fr['catalog.form.save'] : fr['catalog.color.add']}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={reset}>
              {fr['catalog.form.cancel']}
            </Button>
          )}
        </div>
      </form>
      <div className="mt-4">
        <DataTable
          caption={fr['catalog.colors.caption']}
          columns={columns}
          data={list.data ?? []}
          getRowId={(r) => r.id}
        />
      </div>
    </section>
  );
}
