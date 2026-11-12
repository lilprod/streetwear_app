import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type {
  CreateOrderInput,
  OrderPaymentMethod,
  PaymentMethod,
  ReceptionInput,
} from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError, type ApiClient } from '../../api/types';
import { t } from '../../i18n/fr';
import { getStorage, type KeyValueStorage } from '../../storage';
import { newLayerId } from '../studio/model';

export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 120_000;
const ATTEMPT_KEY = 'payment:attempt';

/**
 * Tentative de paiement, persistée : les deux `Idempotency-Key` sont générées UNE fois et rejouées
 * à chaque nouvel appui ou reprise réseau ; `paymentId` permet de reprendre l'attente après un redémarrage.
 */
export type PaymentAttempt = {
  orderBody: string | null;
  orderKey: string;
  orderId: string | null;
  paymentBody: string;
  paymentKey: string;
  paymentId: string | null;
  waitStartedAt: number | null;
};

export type PayInput = {
  /** Nouvelle commande : réception choisie. Absent quand `orderId` reprend une commande existante. */
  reception?: ReceptionInput;
  orderId?: string;
  orderMethod: OrderPaymentMethod;
  payWith: PaymentMethod;
  payerPhone?: string;
};

export type ErrorAction = 'chooseSlot' | 'chooseReception' | 'cart' | 'orders' | null;

export type PayPhase =
  | { name: 'idle' }
  | { name: 'creating' }
  | { name: 'redirecting' }
  | { name: 'waiting'; paymentId: string; offline: boolean }
  | { name: 'succeeded'; orderId: string }
  | { name: 'failed'; orderId: string }
  | { name: 'timeout'; paymentId: string; orderId: string }
  | { name: 'error'; message: string; action: ErrorAction };

export const paymentStore = createStore<{ phase: PayPhase }>(() => ({ phase: { name: 'idle' } }));
export const usePayment = <T>(selector: (s: { phase: PayPhase }) => T): T =>
  useStore(paymentStore, selector);
const setPhase = (phase: PayPhase) => paymentStore.setState({ phase });
export const resetPayment = (): void => {
  stopPolling();
  inflight = null;
  setPhase({ name: 'idle' });
};

export type PayDeps = {
  api: ApiClient;
  storage: Pick<KeyValueStorage, 'getString' | 'set' | 'remove'>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  openCardPage: (url: string) => Promise<void>;
  intervalMs: number;
  timeoutMs: number;
};

export function defaultPayDeps(): PayDeps {
  return {
    api: getApi(),
    storage: getStorage(),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    openCardPage: async (url) => {
      const WebBrowser = await import('expo-web-browser');
      await WebBrowser.openAuthSessionAsync(url, 'streetwear://paiement/retour');
    },
    intervalMs: POLL_INTERVAL_MS,
    timeoutMs: POLL_TIMEOUT_MS,
  };
}

export function loadAttempt(storage: Pick<PayDeps['storage'], 'getString'>): PaymentAttempt | null {
  const raw = storage.getString(ATTEMPT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaymentAttempt;
  } catch {
    return null;
  }
}
const saveAttempt = (deps: PayDeps, a: PaymentAttempt) =>
  deps.storage.set(ATTEMPT_KEY, JSON.stringify(a));
export const clearAttempt = (storage: Pick<PayDeps['storage'], 'remove'>): void =>
  storage.remove(ATTEMPT_KEY);

let pollToken = 0;
let inflight: Promise<void> | null = null;
export function stopPolling(): void {
  pollToken += 1;
}

function attemptFor(deps: PayDeps, input: PayInput): PaymentAttempt {
  const orderBody = input.orderId
    ? null
    : JSON.stringify({ reception: input.reception, paymentMethod: input.orderMethod });
  const paymentBody = JSON.stringify({
    method: input.payWith,
    payerPhone: input.payerPhone ?? null,
  });
  const stored = loadAttempt(deps.storage);
  let attempt: PaymentAttempt;
  if (
    stored &&
    (input.orderId ? stored.orderId === input.orderId : stored.orderBody === orderBody)
  ) {
    attempt = { ...stored };
    if (attempt.paymentBody !== paymentBody) {
      attempt.paymentBody = paymentBody;
      attempt.paymentKey = newLayerId();
      attempt.paymentId = null;
      attempt.waitStartedAt = null;
    }
  } else {
    attempt = {
      orderBody,
      orderKey: newLayerId(),
      orderId: input.orderId ?? null,
      paymentBody,
      paymentKey: newLayerId(),
      paymentId: null,
      waitStartedAt: null,
    };
  }
  saveAttempt(deps, attempt);
  return attempt;
}

export function describePayError(e: unknown): { message: string; action: ErrorAction } {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'SLOT_FULL':
        return { message: t('payment.error.slotFull'), action: 'chooseSlot' };
      case 'OUT_OF_ZONE':
        return { message: t('payment.error.outOfZone'), action: 'chooseReception' };
      case 'OUT_OF_STOCK':
        return { message: t('payment.error.outOfStock'), action: 'cart' };
      case 'ORDER_NOT_PAYABLE':
        return { message: t('payment.error.notPayable'), action: 'orders' };
      case 'NETWORK':
      case 'TIMEOUT':
        return { message: t('payment.error.network'), action: null };
      case 'PROVIDER_UNAVAILABLE':
        return { message: t('payment.error.provider'), action: null };
      case 'IDEMPOTENCY_CONFLICT':
        return { message: t('payment.error.conflict'), action: null };
      default:
        return { message: t('payment.error.generic'), action: null };
    }
  }
  return { message: t('payment.error.generic'), action: null };
}

/** Lance (ou rejoue) le paiement : un seul paiement côté serveur quelles que soient les répétitions. */
export function startPayment(input: PayInput, deps: PayDeps = defaultPayDeps()): Promise<void> {
  if (inflight) return inflight;
  inflight = run(input, deps).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(input: PayInput, deps: PayDeps): Promise<void> {
  stopPolling();
  setPhase({ name: 'creating' });
  const attempt = attemptFor(deps, input);
  try {
    if (!attempt.orderId) {
      const order = await deps.api.createOrder(
        JSON.parse(attempt.orderBody as string) as CreateOrderInput,
        attempt.orderKey,
      );
      attempt.orderId = order.id;
      saveAttempt(deps, attempt);
    }
    const orderId = attempt.orderId;
    let paymentId = attempt.paymentId;
    let redirectUrl: string | null = null;
    if (!paymentId) {
      try {
        const payment = await deps.api.createPayment(
          orderId,
          { method: input.payWith, ...(input.payerPhone ? { payerPhone: input.payerPhone } : {}) },
          attempt.paymentKey,
        );
        paymentId = payment.paymentId;
        if (payment.nextAction.type === 'redirect') redirectUrl = payment.nextAction.url;
      } catch (e) {
        const pending = e instanceof ApiError ? paymentIdOf(e) : null;
        if (!pending) throw e;
        paymentId = pending;
      }
      attempt.paymentId = paymentId;
    }
    attempt.waitStartedAt = deps.now();
    saveAttempt(deps, attempt);
    if (redirectUrl) {
      setPhase({ name: 'redirecting' });
      await deps.openCardPage(redirectUrl).catch(() => undefined);
    }
    await poll(deps, attempt);
  } catch (e) {
    const { message, action } = describePayError(e);
    setPhase({ name: 'error', message, action });
  }
}

function paymentIdOf(e: ApiError): string | null {
  if (e.code !== 'ORDER_NOT_PAYABLE') return null;
  const d = e.details as { reason?: unknown; paymentId?: unknown } | undefined;
  return d?.reason === 'payment_pending' && typeof d.paymentId === 'string' ? d.paymentId : null;
}

/** Reprend l'attente d'un paiement déjà créé (redémarrage, retour au premier plan, réseau revenu). */
export function resumePayment(orderId: string, deps: PayDeps = defaultPayDeps()): Promise<void> {
  const attempt = loadAttempt(deps.storage);
  if (!attempt?.paymentId || attempt.orderId !== orderId) return Promise.resolve();
  if (inflight) return inflight;
  inflight = poll(deps, attempt)
    .catch((e: unknown) => {
      const { message, action } = describePayError(e);
      setPhase({ name: 'error', message, action });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Après un délai dépassé : une nouvelle fenêtre d'attente de 2 minutes. */
export function recheckPayment(orderId: string, deps: PayDeps = defaultPayDeps()): Promise<void> {
  const attempt = loadAttempt(deps.storage);
  if (!attempt?.paymentId) return Promise.resolve();
  attempt.waitStartedAt = deps.now();
  saveAttempt(deps, attempt);
  return resumePayment(orderId, deps);
}

async function poll(deps: PayDeps, attempt: PaymentAttempt): Promise<void> {
  const token = ++pollToken;
  const paymentId = attempt.paymentId as string;
  const orderId = attempt.orderId as string;
  const startedAt = attempt.waitStartedAt ?? deps.now();
  let offline = false;
  setPhase({ name: 'waiting', paymentId, offline });
  for (;;) {
    if (token !== pollToken) return;
    try {
      const res = await deps.api.getPayment(paymentId);
      if (token !== pollToken) return;
      if (offline) {
        offline = false;
        setPhase({ name: 'waiting', paymentId, offline });
      }
      if (res.status === 'succeeded') {
        clearAttempt(deps.storage);
        setPhase({ name: 'succeeded', orderId });
        return;
      }
      if (res.status === 'failed' || res.status === 'expired') {
        const next: PaymentAttempt = {
          ...attempt,
          paymentKey: newLayerId(),
          paymentId: null,
          waitStartedAt: null,
        };
        saveAttempt(deps, next);
        setPhase({ name: 'failed', orderId });
        return;
      }
    } catch (e) {
      if (token !== pollToken) return;
      if (e instanceof ApiError && e.isNetwork) {
        if (!offline) {
          offline = true;
          setPhase({ name: 'waiting', paymentId, offline });
        }
      } else if (e instanceof ApiError && e.code === 'NOT_FOUND') {
        throw e;
      }
    }
    if (deps.now() - startedAt >= deps.timeoutMs) {
      setPhase({ name: 'timeout', paymentId, orderId });
      return;
    }
    await deps.sleep(deps.intervalMs);
  }
}
