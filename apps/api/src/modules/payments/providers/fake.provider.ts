import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { formatXof } from '@streetwear/shared';
import { Redis } from 'ioredis';
import {
  MalformedWebhookError,
  type InitiateInput,
  type InitiateResult,
  type ParsedWebhook,
  type PaymentProvider,
  type ProviderPaymentStatus,
  type ProviderStatus,
  type ProviderTransaction,
  type WebhookHeaders,
} from './payment-provider';

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

/**
 * Scénario piloté par les deux derniers chiffres du numéro payeur :
 * `00` échec · `01` webhook perdu (seul `getStatus` répond) · `02` webhook envoyé 3 fois ·
 * `03` jamais validé par le client · autre numéro ou carte : succès.
 */
export type FakeScenario = 'success' | 'failure' | 'lost_webhook' | 'replayed' | 'never_approved';

export function fakeScenario(phone: string | null): FakeScenario {
  switch (phone?.slice(-2)) {
    case '00':
      return 'failure';
    case '01':
      return 'lost_webhook';
    case '02':
      return 'replayed';
    case '03':
      return 'never_approved';
    default:
      return 'success';
  }
}

interface FakeTx {
  ref: string;
  paymentId: string;
  amountXof: number;
  method: string;
  scenario: FakeScenario;
  createdAt: string;
}

export interface FakeWebhook {
  headers: Record<string, string>;
  body: string;
}

export interface FakeProviderOptions {
  secret: string;
  redisUrl: string;
  /** Si défini, le fake poste lui-même ses webhooks à cette URL après `delayMs` (développement). */
  webhookUrl?: string;
  delayMs: number;
}

const TTL_SECONDS = 35 * 86_400;
const METHOD_LABEL: Record<string, string> = { tmoney: 'T-Money', flooz: 'Flooz' };

/** Agrégateur simulé (développement et tests) : signature HMAC-SHA256 du corps brut. */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly logger = new Logger('FakePaymentProvider');
  private readonly redis: Redis;

  constructor(private readonly opts: FakeProviderOptions) {
    this.redis = new Redis(opts.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const ref = `fk_${randomUUID().replace(/-/g, '')}`;
    const tx: FakeTx = {
      ref,
      paymentId: input.payment.id,
      amountXof: input.payment.amountXof,
      method: input.method,
      scenario: input.method === 'card' ? 'success' : fakeScenario(input.payerPhone),
      createdAt: new Date().toISOString(),
    };
    await this.redis
      .multi()
      .set(this.txKey(ref), JSON.stringify(tx), 'EX', TTL_SECONDS)
      .sadd(this.dayKey(tx.createdAt.slice(0, 10)), ref)
      .expire(this.dayKey(tx.createdAt.slice(0, 10)), TTL_SECONDS)
      .exec();
    if (this.opts.webhookUrl) this.dispatchLater(ref);
    const nextAction: InitiateResult['nextAction'] =
      input.method === 'card'
        ? {
            type: 'redirect',
            url: `https://fake-pay.invalid/checkout/${ref}?return=${encodeURIComponent(input.returnUrl)}`,
          }
        : {
            type: 'approve_on_phone',
            message: `Valide le paiement de ${formatXof(input.payment.amountXof)} sur ton téléphone (${METHOD_LABEL[input.method]}).`,
          };
    return { providerRef: ref, nextAction };
  }

  async getStatus(providerRef: string): Promise<ProviderStatus> {
    const tx = await this.find(providerRef);
    return { providerRef, status: tx ? finalStatus(tx) : 'failed', amountXof: tx?.amountXof ?? 0 };
  }

  verifyWebhook(headers: WebhookHeaders, rawBody: Buffer): boolean {
    const given = headers[FAKE_SIGNATURE_HEADER];
    if (typeof given !== 'string' || !/^[0-9a-f]{64}$/i.test(given)) return false;
    const expected = createHmac('sha256', this.opts.secret).update(rawBody).digest();
    return timingSafeEqual(Buffer.from(given, 'hex'), expected);
  }

  parseWebhook(rawBody: Buffer): ParsedWebhook {
    let raw: unknown;
    try {
      raw = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new MalformedWebhookError('Corps JSON invalide');
    }
    const b = raw as Record<string, unknown>;
    const status = b.status;
    if (
      typeof b.reference !== 'string' ||
      (status !== 'succeeded' && status !== 'failed' && status !== 'pending') ||
      !Number.isSafeInteger(b.amount) ||
      b.currency !== 'XOF'
    ) {
      throw new MalformedWebhookError('Champs manquants ou invalides');
    }
    return {
      providerRef: b.reference,
      paymentId: typeof b.merchantReference === 'string' ? b.merchantReference : undefined,
      status,
      amountXof: b.amount as number,
      raw,
    };
  }

  async listTransactions(date: string): Promise<ProviderTransaction[]> {
    const refs = await this.redis.smembers(this.dayKey(date));
    const out: ProviderTransaction[] = [];
    for (const ref of refs) {
      const tx = await this.find(ref);
      if (tx) {
        out.push({
          providerRef: ref,
          status: finalStatus(tx),
          amountXof: tx.amountXof,
          occurredAt: new Date(tx.createdAt),
        });
      }
    }
    return out;
  }

  // ---- Outils du simulateur (tests, parcours de développement) ----

  sign(body: string | Buffer): string {
    return createHmac('sha256', this.opts.secret).update(body).digest('hex');
  }

  /** Webhook signé, tel que l'agrégateur l'enverrait ; `override` permet de le falsifier. */
  webhook(
    tx: Pick<FakeTx, 'ref' | 'paymentId' | 'amountXof'>,
    status: ProviderPaymentStatus,
    override: Record<string, unknown> = {},
  ): FakeWebhook {
    const body = JSON.stringify({
      event: 'payment.updated',
      reference: tx.ref,
      merchantReference: tx.paymentId,
      status,
      amount: tx.amountXof,
      currency: 'XOF',
      occurredAt: new Date().toISOString(),
      ...override,
    });
    return {
      headers: { 'content-type': 'application/json', [FAKE_SIGNATURE_HEADER]: this.sign(body) },
      body,
    };
  }

  /** Webhooks que le scénario du paiement produit (aucun, un ou trois identiques). */
  async webhooksFor(providerRef: string): Promise<FakeWebhook[]> {
    const tx = await this.find(providerRef);
    if (!tx || tx.scenario === 'lost_webhook' || tx.scenario === 'never_approved') return [];
    const hook = this.webhook(tx, finalStatus(tx));
    return tx.scenario === 'replayed' ? [hook, hook, hook] : [hook];
  }

  /** Efface les transactions simulées (tests du rapprochement). */
  async reset(): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'fakepay:*', 'COUNT', 500);
      if (keys.length) await this.redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }

  private dispatchLater(ref: string): void {
    const url = this.opts.webhookUrl as string;
    setTimeout(() => {
      void this.webhooksFor(ref)
        .then(async (hooks) => {
          for (const h of hooks)
            await fetch(url, { method: 'POST', headers: h.headers, body: h.body });
        })
        .catch(() => this.logger.warn('Envoi du webhook simulé en échec'));
    }, this.opts.delayMs).unref();
  }

  private async find(ref: string): Promise<FakeTx | null> {
    const v = await this.redis.get(this.txKey(ref));
    return v ? (JSON.parse(v) as FakeTx) : null;
  }

  private txKey(ref: string): string {
    return `fakepay:tx:${ref}`;
  }

  private dayKey(date: string): string {
    return `fakepay:day:${date}`;
  }
}

function finalStatus(tx: FakeTx): ProviderPaymentStatus {
  if (tx.scenario === 'failure') return 'failed';
  if (tx.scenario === 'never_approved') return 'pending';
  return 'succeeded';
}
