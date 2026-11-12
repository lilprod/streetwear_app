import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/button';
import { CheckField, SelectField, TextField } from '../../components/field';
import { useToast } from '../../components/toast';
import { fr } from '../../i18n/fr';
import { isUnconfigured, reasonMessages } from '../../lib/reasons';
import {
  createPattern,
  requestUploadSignature,
  updatePattern,
  uploadToProvider,
  type CatalogPattern,
  type PatternFormat,
  type PatternInput,
  type PatternCategory,
  type PriceTier,
  UploadError,
} from '../../lib/catalog-api';

const MAX_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg'];

type Meta = {
  name: string;
  origin: string;
  categoryId: string;
  tags: string;
  priceTier: PriceTier;
  rightsHolder: string;
  rightsProofUrl: string;
  active: boolean;
};

const initialMeta = (p?: CatalogPattern, categoryId = ''): Meta => ({
  name: p?.name ?? '',
  origin: p?.origin ?? '',
  categoryId: p?.categoryId ?? categoryId,
  tags: p?.tags.join(', ') ?? '',
  priceTier: p?.priceTier ?? 'standard',
  rightsHolder: p?.rightsHolder ?? '',
  rightsProofUrl: p?.rightsProofUrl ?? '',
  active: p?.active ?? false,
});

const toMeta = (m: Meta) => ({
  name: m.name.trim(),
  origin: m.origin.trim(),
  categoryId: m.categoryId,
  tags: m.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  priceTier: m.priceTier,
  rightsHolder: m.rightsHolder.trim() || null,
  rightsProofUrl: m.rightsProofUrl.trim() || null,
  active: m.active,
});

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const formatOf = (ext: string): PatternFormat => (ext === 'jpeg' ? 'jpg' : (ext as PatternFormat));

export function PatternForm({
  pattern,
  categories,
  onDone,
}: {
  pattern?: CatalogPattern;
  categories: PatternCategory[];
  onDone: () => void;
}) {
  const isEdit = !!pattern;
  const qc = useQueryClient();
  const toast = useToast();
  const [meta, setMeta] = useState<Meta>(() => initialMeta(pattern, categories[0]?.id));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [stage, setStage] = useState<'idle' | 'signing' | 'sending' | 'saving'>('idle');

  const set = <K extends keyof Meta>(k: K, v: Meta[K]) => setMeta((m) => ({ ...m, [k]: v }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!meta.name.trim()) e.name = fr['catalog.form.nameRequired'];
    if (!meta.categoryId) e.categoryId = fr['catalog.form.categoryRequired'];
    if (!isEdit) {
      if (!file) e.file = fr['catalog.form.fileRequired'];
      else if (!EXTENSIONS.includes(extensionOf(file.name))) e.file = fr['catalog.form.fileFormat'];
      else if (file.size > MAX_BYTES) e.file = fr['catalog.form.fileTooLarge'];
    }
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormErrors([]);
    if (Object.keys(e).length > 0) return;
    try {
      if (isEdit && pattern) {
        setStage('saving');
        await updatePattern(pattern.id, toMeta(meta));
        toast.show(fr['catalog.saved']);
      } else if (file) {
        setStage('signing');
        const sig = await requestUploadSignature('pattern');
        setStage('sending');
        const up = await uploadToProvider(sig, file);
        const ext = extensionOf(file.name);
        setStage('saving');
        const svgSource = ext === 'svg' ? await file.text() : undefined;
        await createPattern({
          ...toMeta(meta),
          imagePublicId: up.public_id,
          imageFormat: formatOf(up.format || ext),
          imageBytes: up.bytes,
          widthPx: up.width ?? 0,
          heightPx: up.height ?? 0,
          svgSource,
        } satisfies PatternInput);
        toast.show(fr['catalog.created']);
      }
      await qc.invalidateQueries({ queryKey: ['catalog', 'patterns'] });
      onDone();
    } catch (err) {
      setStage('idle');
      if (isUnconfigured(err)) setFormErrors([fr['catalog.upload.unconfigured']]);
      else if (err instanceof UploadError) setFormErrors([fr['catalog.upload.failed']]);
      else setFormErrors(reasonMessages(err, 'catalog.reason'));
    }
  };

  const busy = stage !== 'idle';
  const stageLabel =
    stage === 'signing'
      ? fr['catalog.upload.signing']
      : stage === 'sending'
        ? fr['catalog.upload.sending']
        : stage === 'saving'
          ? fr['catalog.upload.saving']
          : '';

  return (
    <form
      aria-labelledby="pattern-form-title"
      onSubmit={submit}
      noValidate
      className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-2"
    >
      <h2 id="pattern-form-title" className="text-lg font-semibold md:col-span-2">
        {isEdit ? fr['catalog.pattern.edit'] : fr['catalog.pattern.new']}
      </h2>
      {formErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-admin border border-danger p-3 text-sm text-danger md:col-span-2"
        >
          <ul className="list-disc pl-5">
            {formErrors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <TextField
        label={fr['catalog.form.name']}
        value={meta.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors.name}
        required
        maxLength={100}
      />
      <TextField
        label={fr['catalog.form.origin']}
        value={meta.origin}
        onChange={(e) => set('origin', e.target.value)}
        maxLength={200}
      />
      <SelectField
        label={fr['catalog.form.category']}
        value={meta.categoryId}
        onChange={(e) => set('categoryId', e.target.value)}
        error={errors.categoryId}
      >
        <option value="">{fr['catalog.form.chooseCategory']}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={fr['catalog.form.priceTier']}
        value={meta.priceTier}
        onChange={(e) => set('priceTier', e.target.value as PriceTier)}
      >
        <option value="standard">{fr['catalog.tier.standard']}</option>
        <option value="premium">{fr['catalog.tier.premium']}</option>
      </SelectField>
      <TextField
        label={fr['catalog.form.tags']}
        hint={fr['catalog.form.tagsHint']}
        value={meta.tags}
        onChange={(e) => set('tags', e.target.value)}
      />
      <TextField
        label={fr['catalog.form.rightsHolder']}
        value={meta.rightsHolder}
        onChange={(e) => set('rightsHolder', e.target.value)}
        maxLength={200}
      />
      <TextField
        label={fr['catalog.form.rightsProof']}
        type="url"
        value={meta.rightsProofUrl}
        onChange={(e) => set('rightsProofUrl', e.target.value)}
      />
      {!isEdit && (
        <TextField
          label={fr['catalog.form.file']}
          hint={fr['catalog.form.fileHint']}
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          error={errors.file}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      )}
      <div className="md:col-span-2">
        <CheckField
          label={fr['catalog.form.active']}
          checked={meta.active}
          onChange={(v) => set('active', v)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={busy}>
          {fr['catalog.form.submit']}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          {fr['catalog.form.cancel']}
        </Button>
        <p role="status" className="text-sm text-inkSecondary">
          {stageLabel}
        </p>
      </div>
    </form>
  );
}
