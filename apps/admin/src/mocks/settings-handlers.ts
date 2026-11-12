import { http, HttpResponse } from 'msw';
import { apiErr, guardRole, SUPER } from './admin-guard';
import type { NotificationTemplate, ShopSettings } from '../lib/settings-api';

const SAMPLE: Record<string, string> = {
  brand: 'Streetwear',
  orderNumber: 'SW-2026-0101',
  status: 'Payée',
  pickupCode: '123456',
  handoverCode: '654321',
};
const CODE_VARS = ['pickupCode', 'handoverCode'];
const VAR_RE = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;
const GSM7_RE = /^[\n\r !"#$%&'()*+,\-./0-9:;<=>?@A-Z_a-zÄÖÑÜßÀäöñüà^{}\\[~\]|€ÉéÆæ]*$/;

const seedSettings = (): ShopSettings => ({
  cod_deposit_percent: 50,
  order_expiry_minutes: 30,
  payment_methods_enabled: ['tmoney', 'flooz', 'card', 'cod'],
});

const seedTemplates = (): NotificationTemplate[] =>
  [
    {
      key: 'order.paid',
      channel: 'push' as const,
      title: 'Commande {{orderNumber}}',
      body: 'Votre paiement est confirmé. {{brand}} lance la production.',
      active: true,
      variables: ['brand', 'orderNumber', 'status'],
      smsMaxLength: null,
    },
    {
      key: 'order.ready_for_pickup',
      channel: 'sms' as const,
      title: null,
      body: '{{brand}} : commande {{orderNumber}} disponible. Code de retrait : {{pickupCode}}',
      active: true,
      variables: ['brand', 'orderNumber', 'status', 'pickupCode'],
      smsMaxLength: 160,
    },
    {
      key: 'stock.below_threshold',
      channel: 'email' as const,
      title: 'Stock bas',
      body: 'Le stock passe sous le seuil. Vérifiez la production.',
      active: true,
      variables: [],
      smsMaxLength: null,
    },
  ].map((t) => withPreview(t));

type Draft = Omit<NotificationTemplate, 'preview' | 'updatedAt'>;
const render = (text: string | null): string | null =>
  text === null ? null : text.replace(VAR_RE, (_m, name: string) => SAMPLE[name] ?? '');
function withPreview(t: Draft): NotificationTemplate {
  return {
    ...t,
    preview: { title: render(t.title), body: render(t.body) ?? '' },
    updatedAt: '2026-11-01T10:00:00.000Z',
  };
}

let settings = seedSettings();
let templates = seedTemplates();

export const resetSettingsState = (): void => {
  settings = seedSettings();
  templates = seedTemplates();
};

const allowedVars = (key: string): string[] => {
  const base = ['brand', 'orderNumber', 'status'];
  if (key === 'order.ready_for_pickup') return [...base, 'pickupCode'];
  if (key === 'order.shipped') return [...base, 'handoverCode'];
  return base;
};

function templateProblems(t: NotificationTemplate): string[] {
  const reasons = new Set<string>();
  const allowed = allowedVars(t.key);
  const title = t.title ?? '';
  for (const [text, isTitle] of [
    [title, true],
    [t.body, false],
  ] as const) {
    for (const m of text.matchAll(VAR_RE)) {
      const name = m[1] ?? '';
      if (!allowed.includes(name)) reasons.add('UNKNOWN_VARIABLE');
      else if (isTitle && CODE_VARS.includes(name)) reasons.add('CODE_IN_TITLE');
    }
    if (/\{\{[^}]*$|\{[^{}]*$/.test(text)) reasons.add('MALFORMED_PLACEHOLDER');
  }
  if (t.channel === 'sms') {
    if (t.title) reasons.add('SMS_HAS_NO_TITLE');
    const rendered = render(t.body) ?? '';
    if (!GSM7_RE.test(rendered)) reasons.add('SMS_NOT_GSM7');
    else if (rendered.length > 160) reasons.add('SMS_TOO_LONG');
  } else if (!t.title) {
    reasons.add('TITLE_REQUIRED');
  }
  return [...reasons];
}

export const settingsHandlers = [
  http.get('*/v1/admin/settings', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json(settings);
  }),
  http.patch('*/v1/admin/settings', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Partial<ShopSettings>;
    const next = { ...settings, ...b };
    const methods = next.payment_methods_enabled;
    if (
      !Number.isInteger(next.cod_deposit_percent) ||
      next.cod_deposit_percent < 0 ||
      next.cod_deposit_percent > 100 ||
      !Number.isInteger(next.order_expiry_minutes) ||
      next.order_expiry_minutes < 5 ||
      next.order_expiry_minutes > 1440 ||
      methods.length < 1 ||
      new Set(methods).size !== methods.length
    ) {
      return apiErr(400, 'VALIDATION_FAILED', 'Les réglages saisis sont invalides.');
    }
    settings = next;
    return HttpResponse.json(settings);
  }),

  http.get('*/v1/admin/notification-templates', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json({ items: templates });
  }),
  http.patch('*/v1/admin/notification-templates', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as {
      key: string;
      channel: NotificationTemplate['channel'];
      title?: string | null;
      body?: string;
      active?: boolean;
    };
    const row = templates.find((t) => t.key === b.key && t.channel === b.channel);
    if (!row) return apiErr(404, 'NOT_FOUND', 'Élément introuvable.');
    const draft = withPreview({
      ...row,
      title: b.title === undefined ? row.title : b.title,
      body: b.body ?? row.body,
      active: b.active ?? row.active,
    });
    const reasons = templateProblems(draft);
    if (reasons.length) {
      return apiErr(400, 'VALIDATION_FAILED', 'Modèle refusé.', { reasons });
    }
    const updated = { ...draft, updatedAt: new Date().toISOString() };
    templates = templates.map((t) => (t === row ? updated : t));
    return HttpResponse.json(updated);
  }),
];
