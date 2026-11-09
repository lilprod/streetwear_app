import type { NextAction } from '@streetwear/shared';

export type ProviderMethod = 'tmoney' | 'flooz' | 'card';
export type ProviderPaymentStatus = 'pending' | 'succeeded' | 'failed';
export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface InitiateInput {
  payment: { id: string; amountXof: number; kind: 'full' | 'deposit' | 'balance' };
  order: { id: string; number: string };
  method: ProviderMethod;
  /** E.164 ; `null` pour la carte. */
  payerPhone: string | null;
  /** Lien de retour dans l'application après la page de paiement (carte). */
  returnUrl: string;
}

export interface InitiateResult {
  providerRef: string;
  nextAction: NextAction;
}

export interface ProviderStatus {
  providerRef: string;
  status: ProviderPaymentStatus;
  amountXof: number;
}

export interface ParsedWebhook {
  providerRef: string;
  /** Notre référence (`payment.id`) renvoyée par l'agrégateur, si fournie. */
  paymentId?: string;
  status: ProviderPaymentStatus;
  amountXof: number;
  raw: unknown;
}

export interface ProviderTransaction {
  providerRef: string;
  status: ProviderPaymentStatus;
  amountXof: number;
  occurredAt: Date;
}

/**
 * Contrat d'un agrégateur de paiement (ADR-004). Un nouvel agrégateur = une classe dans ce dossier,
 * enregistrée dans `providers.factory.ts` ; rien d'autre ne change.
 */
export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  getStatus(providerRef: string): Promise<ProviderStatus>;
  /** Vérification de signature en temps constant ; ne lève jamais. */
  verifyWebhook(headers: WebhookHeaders, rawBody: Buffer): boolean;
  /** Lève `MalformedWebhookError` si le corps est inexploitable. */
  parseWebhook(rawBody: Buffer): ParsedWebhook;
  /** Transactions du jour civil `date` (`YYYY-MM-DD`, Africa/Lome = UTC). */
  listTransactions(date: string): Promise<ProviderTransaction[]>;
  /** Remboursement par API : V1, non implémenté au MVP. */
  refund?(providerRef: string, amountXof: number): Promise<{ refundRef: string }>;
}

export class MalformedWebhookError extends Error {}

/** Erreur réseau ou réponse inattendue de l'agrégateur → 502 PROVIDER_UNAVAILABLE. */
export class ProviderUnavailableError extends Error {}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

export interface PaymentProviders {
  /** Agrégateur utilisé pour les nouveaux paiements. */
  readonly active: PaymentProvider;
  get(name: string): PaymentProvider | undefined;
  all(): PaymentProvider[];
}
