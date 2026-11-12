import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { Badge, CheckField, TextAreaField, TextField } from '../../components/field';
import { useToast } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import { reasonMessages } from '../../lib/reasons';
import { listTemplates, patchTemplate, type NotificationTemplate } from '../../lib/settings-api';

const col = createColumnHelper<NotificationTemplate>();
const SMS_LENGTH = 160;

export function TemplatesPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: ['settings', 'templates'],
    queryFn: ({ signal }) => listTemplates(signal),
  });
  const [selected, setSelected] = useState<NotificationTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [active, setActive] = useState(true);
  const [preview, setPreview] = useState<NotificationTemplate['preview'] | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const items = list.data?.items ?? [];
  const select = (t: NotificationTemplate) => {
    setSelected(t);
    setTitle(t.title ?? '');
    setBody(t.body);
    setActive(t.active);
    setPreview(t.preview);
    setFormErrors([]);
  };

  const save = useMutation({
    mutationFn: (t: NotificationTemplate) =>
      patchTemplate({
        key: t.key,
        channel: t.channel,
        title: t.channel === 'sms' ? null : title.trim() || null,
        body: body.trim(),
        active,
      }),
    onSuccess: (updated) => {
      toast.show(fr['templates.saved']);
      setPreview(updated.preview);
      setSelected(updated);
      setFormErrors([]);
      void qc.invalidateQueries({ queryKey: ['settings', 'templates'] });
    },
    onError: (err) => setFormErrors(reasonMessages(err, 'templates.reason')),
  });

  const columns = [
    col.accessor('key', {
      header: fr['templates.col.key'],
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    col.accessor('channel', {
      header: fr['templates.col.channel'],
      cell: (c) => fr[`templates.channel.${c.getValue()}` as FrKey],
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
        <Button variant="secondary" onClick={() => select(c.row.original)}>
          {fr['templates.action.edit']}
          <span className="sr-only">
            {' '}
            {c.row.original.key} {fr[`templates.channel.${c.row.original.channel}` as FrKey]}
          </span>
        </Button>
      ),
    }),
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (selected) save.mutate(selected);
  };

  return (
    <section aria-labelledby="templates-title" className="mt-8">
      <h2 id="templates-title" className="text-lg font-semibold">
        {fr['templates.title']}
      </h2>
      <p className="mt-1 text-sm text-inkSecondary">{fr['templates.hint']}</p>
      {list.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {fr['templates.loadError']}
        </p>
      )}
      <div className="mt-4">
        <DataTable
          caption={fr['templates.caption']}
          columns={columns}
          data={items}
          getRowId={(r) => `${r.key}:${r.channel}`}
        />
      </div>
      {selected && (
        <form
          onSubmit={submit}
          noValidate
          aria-labelledby="template-edit-title"
          className="mt-4 grid gap-4 rounded-admin-lg border border-border bg-surface p-4 md:grid-cols-2"
        >
          <h3 id="template-edit-title" className="text-base font-semibold md:col-span-2">
            {fr['templates.edit']} · <span className="font-mono text-sm">{selected.key}</span>
          </h3>
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
          <div className="md:col-span-2">
            <TextField
              label={fr['templates.field.title']}
              hint={
                selected.channel === 'sms'
                  ? fr['templates.field.titleSmsHint']
                  : fr['templates.field.titleHint']
              }
              value={title}
              disabled={selected.channel === 'sms'}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <TextAreaField
              label={fr['templates.field.body']}
              hint={
                selected.channel === 'sms'
                  ? `${fr['templates.field.bodyHint']} ${fr['templates.sms.limit'].replace('{max}', String(SMS_LENGTH))}`
                  : fr['templates.field.bodyHint']
              }
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <p className="text-xs text-inkSecondary md:col-span-2">
            {fr['templates.variables']}{' '}
            {selected.variables.length > 0
              ? selected.variables.map((v) => `{{${v}}}`).join(', ')
              : fr['templates.variables.none']}
          </p>
          <div className="md:col-span-2">
            <CheckField label={fr['catalog.form.active']} checked={active} onChange={setActive} />
          </div>
          <section aria-labelledby="template-preview-title" className="md:col-span-2">
            <h4 id="template-preview-title" className="text-sm font-medium">
              {fr['templates.preview']}
            </h4>
            <div
              aria-live="polite"
              className="mt-2 rounded-admin border border-border bg-surfaceMuted p-3 text-sm"
            >
              {preview?.title && <p className="font-semibold">{preview.title}</p>}
              <p className="whitespace-pre-line">{preview?.body ?? ''}</p>
            </div>
          </section>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {fr['catalog.form.save']}
            </Button>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              {fr['catalog.form.cancel']}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
