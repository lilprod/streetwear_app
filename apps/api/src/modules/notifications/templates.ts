import type { NotificationChannel, OrderStatus } from '@prisma/client';
import { gsm7Length, toGsm7, SMS_MAX_SEPTETS } from './gsm7';

export type Channel = NotificationChannel;

export const CODE_VARS = ['pickupCode', 'handoverCode'] as const;
export type CodeVar = (typeof CODE_VARS)[number];

export interface TemplateSpec {
  key: string;
  /** Variables autorisées (les codes ne le sont que dans le corps). */
  vars: readonly string[];
  /** Valeurs d'aperçu (codes factices). */
  sample: Record<string, string>;
  /** Valeurs maximales réalistes (test de longueur SMS). */
  max: Record<string, string>;
}

const ORDER_BASE = ['brand', 'orderNumber', 'status'] as const;
const ORDER_SAMPLE = { brand: 'Streetwear', orderNumber: 'TG-000123', status: 'payée' };
const ORDER_MAX = { brand: 'B'.repeat(20), orderNumber: 'TG-9999999', status: 'Prête au retrait' };

const orderSpec = (status: string, extra: readonly CodeVar[] = []): TemplateSpec => ({
  key: `order.${status}`,
  vars: [...ORDER_BASE, ...extra],
  sample: { ...ORDER_SAMPLE, ...Object.fromEntries(extra.map((c) => [c, '123456'])) },
  max: { ...ORDER_MAX, ...Object.fromEntries(extra.map((c) => [c, '999999'])) },
});

const alertSpec = (
  key: string,
  vars: Record<string, [sample: string, max: string]>,
): TemplateSpec => ({
  key,
  vars: Object.keys(vars),
  sample: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v[0]])),
  max: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v[1]])),
});

export const TEMPLATE_SPECS: readonly TemplateSpec[] = [
  orderSpec('paid'),
  orderSpec('in_production'),
  orderSpec('ready_for_pickup', ['pickupCode']),
  orderSpec('shipped', ['handoverCode']),
  orderSpec('delivered'),
  orderSpec('payment_failed'),
  orderSpec('expired'),
  alertSpec('stock.below_threshold', {
    color: ['Noir', 'Bleu nuit profond'],
    size: ['M', 'XXL'],
    available: ['2', '99999'],
    alertThreshold: ['5', '99999'],
  }),
  alertSpec('production.render_failed', {
    orderNumber: ['TG-000123', 'TG-9999999'],
    errorCode: ['PATTERN_ASSET_MISSING', 'PATTERN_ASSET_MISSING'],
  }),
  alertSpec('payment.amount_mismatch', {
    orderNumber: ['TG-000123', 'TG-9999999'],
    provider: ['fake', 'fake'],
    expectedXof: ['12 000 FCFA', '9 999 999 FCFA'],
    receivedXof: ['10 000 FCFA', '9 999 999 FCFA'],
  }),
  alertSpec('payment.unexpected_success', {
    orderNumber: ['TG-000123', 'TG-9999999'],
    provider: ['fake', 'fake'],
    amountXof: ['12 000 FCFA', '9 999 999 FCFA'],
    orderStatus: ['expirée', 'expirée'],
  }),
  alertSpec('reconciliation.mismatch', {
    date: ['2026-11-10', '2026-11-10'],
    provider: ['fake', 'fake'],
    matched: ['42', '99999'],
    mismatchCount: ['3', '99999'],
  }),
];

export const SPEC_BY_KEY = new Map(TEMPLATE_SPECS.map((s) => [s.key, s]));

/** Statut de commande → clé de modèle client (absent = pas de notification). */
export const STATUS_TEMPLATE_KEY: Partial<Record<OrderStatus, string>> = {
  paid: 'order.paid',
  deposit_paid: 'order.paid',
  in_production: 'order.in_production',
  ready_for_pickup: 'order.ready_for_pickup',
  shipped: 'order.shipped',
  delivered: 'order.delivered',
  payment_failed: 'order.payment_failed',
  expired: 'order.expired',
};

export const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  paid: 'payée',
  deposit_paid: 'acompte payé',
  in_production: 'en production',
  ready_for_pickup: 'prête au retrait',
  shipped: 'en livraison',
  delivered: 'livrée',
  payment_failed: 'paiement non abouti',
  expired: 'expirée',
  cancelled: 'annulée',
  refunded: 'remboursée',
};

export interface TemplateDefault {
  key: string;
  channel: Channel;
  title: string | null;
  body: string;
}

const push = (key: string, title: string, body: string): TemplateDefault => ({
  key,
  channel: 'push',
  title,
  body,
});
const sms = (key: string, body: string): TemplateDefault => ({
  key,
  channel: 'sms',
  title: null,
  body,
});
const email = (key: string, title: string, body: string): TemplateDefault => ({
  key,
  channel: 'email',
  title,
  body,
});

export const TEMPLATE_DEFAULTS: readonly TemplateDefault[] = [
  push('order.paid', 'Commande confirmée', '{{orderNumber}} est payée, on lance la production.'),
  sms('order.paid', "[{{brand}}] : commande {{orderNumber}} confirmée. Suivi dans l'app."),
  push('order.in_production', 'En production', "Ton t-shirt est à l'atelier."),
  push('order.ready_for_pickup', 'Prête au retrait', 'Code de retrait : {{pickupCode}}'),
  sms(
    'order.ready_for_pickup',
    '[{{brand}}] : {{orderNumber}} prête. Code de retrait {{pickupCode}}.',
  ),
  push('order.shipped', 'En route', 'Le livreur arrive. Code de remise : {{handoverCode}}'),
  sms(
    'order.shipped',
    '[{{brand}}] : {{orderNumber}} en livraison. Code de remise {{handoverCode}}.',
  ),
  push('order.delivered', 'Livrée', 'Merci ! Montre-nous ton t-shirt.'),
  push('order.payment_failed', 'Paiement non abouti', "Réessaie depuis l'app."),
  push('order.expired', 'Commande expirée', "Ton panier t'attend."),
  email(
    'stock.below_threshold',
    'Stock bas : {{color}} {{size}} ({{available}})',
    "Le stock de {{color}} en taille {{size}} est à {{available}} (seuil d'alerte : {{alertThreshold}}). Pense à réapprovisionner.",
  ),
  email(
    'production.render_failed',
    'Rendu HD en échec : {{orderNumber}}',
    "Le rendu des fichiers d'impression de la commande {{orderNumber}} a échoué ({{errorCode}}). Vérifie la commande dans le back-office.",
  ),
  email(
    'payment.amount_mismatch',
    'Écart de montant : {{orderNumber}}',
    'Un paiement {{provider}} de {{receivedXof}} a été reçu pour {{expectedXof}} attendus sur la commande {{orderNumber}}. Le paiement est refusé et la commande reste non payée.',
  ),
  email(
    'payment.unexpected_success',
    'Paiement sur commande non payable : {{orderNumber}}',
    'Un paiement de {{amountXof}} ({{provider}}) est arrivé alors que la commande {{orderNumber}} est « {{orderStatus}} ». Un remboursement manuel est à effectuer.',
  ),
  email(
    'reconciliation.mismatch',
    'Rapprochement du {{date}} : {{mismatchCount}} écart(s)',
    'Le rapprochement {{provider}} du {{date}} compte {{mismatchCount}} écart(s) pour {{matched}} paiement(s) conformes. Consulte le rapport dans le back-office.',
  ),
];

// ---- Rendu et validation ----

const VAR_RE = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;

export function render(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_m, name: string) => values[name] ?? '');
}

export type TemplateProblem =
  | { reason: 'UNKNOWN_VARIABLE'; variables: string[] }
  | { reason: 'MALFORMED_PLACEHOLDER' }
  | { reason: 'CODE_IN_TITLE'; variables: string[] }
  | { reason: 'SMS_NOT_GSM7' }
  | { reason: 'SMS_TOO_LONG'; length: number; max: number };

export function variablesOf(text: string): string[] {
  return [...text.matchAll(VAR_RE)].map((m) => m[1] as string);
}

/** Longueur maximale d'un SMS rendu avec les valeurs maximales, en septets GSM-7 ; `null` si non GSM-7. */
export function smsWorstLength(spec: TemplateSpec, body: string): number | null {
  const gsm = toGsm7(render(body, spec.max));
  return gsm === null ? null : gsm7Length(gsm);
}

export function validateTemplate(
  spec: TemplateSpec,
  channel: Channel,
  title: string | null,
  body: string,
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const texts = [title ?? '', body];
  const stripped = texts.map((t) => t.replace(VAR_RE, ''));
  if (stripped.some((t) => t.includes('{{') || t.includes('}}'))) {
    problems.push({ reason: 'MALFORMED_PLACEHOLDER' });
  }
  const used = texts.flatMap(variablesOf);
  const unknown = [...new Set(used.filter((v) => !spec.vars.includes(v)))];
  if (unknown.length) problems.push({ reason: 'UNKNOWN_VARIABLE', variables: unknown });
  const codesInTitle = variablesOf(title ?? '').filter((v) =>
    (CODE_VARS as readonly string[]).includes(v),
  );
  if (codesInTitle.length) problems.push({ reason: 'CODE_IN_TITLE', variables: codesInTitle });
  if (channel === 'sms') {
    const len = smsWorstLength(spec, body);
    if (len === null) problems.push({ reason: 'SMS_NOT_GSM7' });
    else if (len > SMS_MAX_SEPTETS) {
      problems.push({ reason: 'SMS_TOO_LONG', length: len, max: SMS_MAX_SEPTETS });
    }
  }
  return problems;
}

/** Codes référencés par un corps de modèle. */
export function codeVarsIn(body: string): CodeVar[] {
  return CODE_VARS.filter((c) => variablesOf(body).includes(c));
}
