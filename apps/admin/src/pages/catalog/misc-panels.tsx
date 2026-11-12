import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import type { PriceRules } from '@streetwear/shared';
import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { DataTable } from '../../components/data-table';
import { Badge, CheckField, TextField } from '../../components/field';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { errorMessage } from '../../lib/errors';
import { isUnconfigured, reasonMessages } from '../../lib/reasons';
import {
  createBannedWord,
  createFont,
  deleteBannedWord,
  getPriceRules,
  listBannedWords,
  listFonts,
  patchPriceRules,
  requestUploadSignature,
  updateFont,
  uploadToProvider,
  type BannedWord,
  type CatalogFont,
  type FontFormat,
  UploadError,
} from '../../lib/catalog-api';

const MAX_BYTES = 20 * 1024 * 1024;
const FONT_EXT: readonly FontFormat[] = ['ttf', 'otf', 'woff2'];
const fontCol = createColumnHelper<CatalogFont>();
const wordCol = createColumnHelper<BannedWord>();

export function FontsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['catalog', 'fonts'], queryFn: () => listFonts() });
  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [licenseRef, setLicenseRef] = useState('');
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['catalog', 'fonts'] });
  const toggle = useMutation({
    mutationFn: (f: CatalogFont) => updateFont(f.id, { active: !f.active }),
    onSuccess: invalidate,
    onError: (err) => toast.show(reasonMessages(err, 'catalog.reason').join(' '), 'error'),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = fr['catalog.form.nameRequired'];
    if (!family.trim()) next.family = fr['catalog.font.familyRequired'];
    const ext = file?.name.split('.').pop()?.toLowerCase() ?? '';
    if (!file) next.file = fr['catalog.form.fileRequired'];
    else if (!FONT_EXT.includes(ext as FontFormat)) next.file = fr['catalog.font.fileFormat'];
    else if (file.size > MAX_BYTES) next.file = fr['catalog.form.fileTooLarge'];
    setErrors(next);
    setFormErrors([]);
    if (Object.keys(next).length > 0 || !file) return;
    setBusy(true);
    try {
      const sig = await requestUploadSignature('font');
      const up = await uploadToProvider(sig, file);
      await createFont({
        name: name.trim(),
        family: family.trim(),
        filePublicId: up.public_id,
        fileFormat: ext as FontFormat,
        fileBytes: up.bytes,
        licenseRef: licenseRef.trim() || null,
        active,
      });
      toast.show(fr['catalog.font.created']);
      setName('');
      setFamily('');
      setLicenseRef('');
      setFile(null);
      invalidate();
    } catch (err) {
      if (isUnconfigured(err)) setFormErrors([fr['catalog.upload.unconfigured']]);
      else if (err instanceof UploadError) setFormErrors([fr['catalog.upload.failed']]);
      else setFormErrors(reasonMessages(err, 'catalog.reason'));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    fontCol.accessor('name', { header: fr['catalog.col.name'] }),
    fontCol.accessor('family', { header: fr['catalog.font.family'] }),
    fontCol.accessor('licenseRef', {
      header: fr['catalog.font.license'],
      cell: (c) => c.getValue() ?? '—',
    }),
    fontCol.accessor('active', {
      header: fr['catalog.col.status'],
      cell: (c) => (
        <Badge tone={c.getValue() ? 'on' : 'off'}>
          {c.getValue() ? fr['catalog.status.active'] : fr['catalog.status.inactive']}
        </Badge>
      ),
    }),
    fontCol.display({
      id: 'actions',
      header: fr['catalog.col.actions'],
      enableSorting: false,
      cell: (c) => (
        <Button
          variant="secondary"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(c.row.original)}
        >
          {c.row.original.active ? fr['catalog.action.deactivate'] : fr['catalog.action.activate']}
          <span className="sr-only"> {c.row.original.name}</span>
        </Button>
      ),
    }),
  ];

  return (
    <section aria-labelledby="fonts-title" className="mt-4">
      <h2 id="fonts-title" className="text-lg font-semibold">
        {fr['catalog.fonts.title']}
      </h2>
      <form
        onSubmit={submit}
        noValidate
        aria-label={fr['catalog.font.new']}
        className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-2"
      >
        {formErrors.length > 0 && (
          <div
            role="alert"
            className="rounded-admin border border-danger p-3 text-sm text-danger md:col-span-2"
          >
            {formErrors.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        <TextField
          label={fr['catalog.form.name']}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={100}
        />
        <TextField
          label={fr['catalog.font.family']}
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          error={errors.family}
          maxLength={100}
        />
        <TextField
          label={fr['catalog.font.license']}
          value={licenseRef}
          onChange={(e) => setLicenseRef(e.target.value)}
          maxLength={300}
        />
        <TextField
          label={fr['catalog.font.file']}
          hint={fr['catalog.font.fileHint']}
          type="file"
          accept=".ttf,.otf,.woff2"
          error={errors.file}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="md:col-span-2">
          <CheckField label={fr['catalog.form.active']} checked={active} onChange={setActive} />
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>
            {fr['catalog.font.add']}
          </Button>
          <p role="status" className="text-sm text-inkSecondary">
            {busy ? fr['catalog.upload.sending'] : ''}
          </p>
        </div>
      </form>
      <div className="mt-4">
        <DataTable
          caption={fr['catalog.fonts.caption']}
          columns={columns}
          data={list.data ?? []}
          getRowId={(r) => r.id}
        />
      </div>
    </section>
  );
}

const RULE_KEYS: (keyof PriceRules)[] = [
  'baseXof',
  'patternStandardXof',
  'patternPremiumXof',
  'textXof',
];

export function PriceRulesPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useQuery({ queryKey: ['catalog', 'price-rules'], queryFn: () => getPriceRules() });
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const values =
    draft ?? Object.fromEntries(RULE_KEYS.map((k) => [k, String(rules.data?.[k] ?? '')]));

  const save = useMutation({
    mutationFn: (body: Partial<PriceRules>) => patchPriceRules(body),
    onSuccess: () => {
      toast.show(fr['catalog.prices.saved']);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['catalog', 'price-rules'] });
    },
    onError: (err) => toast.show(reasonMessages(err, 'catalog.reason').join(' '), 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const body: Partial<PriceRules> = {};
    for (const k of RULE_KEYS) {
      const raw = values[k] ?? '';
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isInteger(n) || n < 0) {
        next[k] = fr['catalog.prices.format'];
      } else {
        body[k] = n;
      }
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate(body);
  };

  const labels: Record<keyof PriceRules, string> = {
    baseXof: fr['catalog.prices.base'],
    patternStandardXof: fr['catalog.prices.standard'],
    patternPremiumXof: fr['catalog.prices.premium'],
    textXof: fr['catalog.prices.text'],
  };

  if (rules.isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        {errorMessage(rules.error)}
      </p>
    );
  }

  return (
    <section aria-labelledby="prices-title" className="mt-4">
      <h2 id="prices-title" className="text-lg font-semibold">
        {fr['catalog.prices.title']}
      </h2>
      <p className="mt-1 text-sm text-inkSecondary">{fr['catalog.prices.hint']}</p>
      <form
        onSubmit={submit}
        noValidate
        aria-label={fr['catalog.prices.title']}
        className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-2"
      >
        {RULE_KEYS.map((k) => (
          <TextField
            key={k}
            label={labels[k]}
            hint={fr['catalog.prices.unit']}
            inputMode="numeric"
            value={values[k] ?? ''}
            error={errors[k]}
            onChange={(e) => setDraft({ ...values, [k]: e.target.value })}
          />
        ))}
        <div className="md:col-span-2">
          <Button type="submit" disabled={save.isPending || rules.isPending}>
            {fr['catalog.form.save']}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function BannedWordsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: ['catalog', 'banned-words'],
    queryFn: () => listBannedWords(),
  });
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [toDelete, setToDelete] = useState<BannedWord | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['catalog', 'banned-words'] });
  const onError = (err: unknown) =>
    toast.show(reasonMessages(err, 'catalog.reason').join(' '), 'error');

  const add = useMutation({
    mutationFn: (w: string) => createBannedWord(w),
    onSuccess: () => {
      setWord('');
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteBannedWord(id),
    onSuccess: () => {
      toast.show(fr['catalog.banned.removed']);
      setToDelete(null);
      invalidate();
    },
    onError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = word.trim();
    if (clean.length < 3) {
      setError(fr['catalog.banned.minLength']);
      return;
    }
    setError(undefined);
    add.mutate(clean);
  };

  const columns = [
    wordCol.accessor('word', { header: fr['catalog.banned.word'] }),
    wordCol.display({
      id: 'actions',
      header: fr['catalog.col.actions'],
      enableSorting: false,
      cell: (c) => (
        <Button variant="secondary" onClick={() => setToDelete(c.row.original)}>
          {fr['catalog.banned.remove']}
          <span className="sr-only"> {c.row.original.word}</span>
        </Button>
      ),
    }),
  ];

  return (
    <section aria-labelledby="banned-title" className="mt-4">
      <h2 id="banned-title" className="text-lg font-semibold">
        {fr['catalog.banned.title']}
      </h2>
      <p className="mt-1 text-sm text-inkSecondary">{fr['catalog.banned.hint']}</p>
      <form
        onSubmit={submit}
        noValidate
        aria-label={fr['catalog.banned.add']}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-admin-lg border border-border bg-surface p-4"
      >
        <div className="min-w-64 flex-1">
          <TextField
            label={fr['catalog.banned.word']}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            error={error}
            maxLength={60}
          />
        </div>
        <Button type="submit" disabled={add.isPending}>
          {fr['catalog.banned.add']}
        </Button>
      </form>
      <div className="mt-4">
        <DataTable
          caption={fr['catalog.banned.caption']}
          columns={columns}
          data={list.data ?? []}
          getRowId={(r) => r.id}
        />
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        title={fr['catalog.banned.confirm.title']}
        confirmLabel={fr['catalog.banned.remove']}
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        <p>{fr['catalog.banned.confirm.body']}</p>
      </ConfirmDialog>
    </section>
  );
}
