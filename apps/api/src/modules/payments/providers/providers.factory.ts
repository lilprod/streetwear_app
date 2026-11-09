import { z } from 'zod';
import { FakePaymentProvider } from './fake.provider';
import type { PaymentProvider, PaymentProviders } from './payment-provider';

/** Variables propres aux agrégateurs (documentées dans apps/api/.env.example). */
const providersEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().min(1),
  PAYMENT_PROVIDER: z.string().min(1).default('fake'),
  FAKE_PAYMENT_WEBHOOK_SECRET: z.string().default(''),
  FAKE_PAYMENT_WEBHOOK_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  FAKE_PAYMENT_DELAY_MS: z.coerce.number().int().min(0).default(3000),
});

export class PaymentConfigError extends Error {}

class Registry implements PaymentProviders {
  constructor(
    private readonly byName: Map<string, PaymentProvider>,
    readonly active: PaymentProvider,
  ) {}

  get(name: string): PaymentProvider | undefined {
    return this.byName.get(name);
  }

  all(): PaymentProvider[] {
    return [...this.byName.values()];
  }
}

export function createPaymentProviders(source: NodeJS.ProcessEnv): PaymentProviders {
  const parsed = providersEnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new PaymentConfigError(`Configuration paiement invalide :\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  const providers = new Map<string, PaymentProvider>();

  if (env.NODE_ENV !== 'production' && env.FAKE_PAYMENT_WEBHOOK_SECRET.length >= 32) {
    providers.set(
      'fake',
      new FakePaymentProvider({
        secret: env.FAKE_PAYMENT_WEBHOOK_SECRET,
        redisUrl: env.REDIS_URL,
        webhookUrl: env.FAKE_PAYMENT_WEBHOOK_URL,
        delayMs: env.FAKE_PAYMENT_DELAY_MS,
      }),
    );
  }

  const active = providers.get(env.PAYMENT_PROVIDER);
  if (!active) {
    throw new PaymentConfigError(
      env.PAYMENT_PROVIDER === 'fake'
        ? env.NODE_ENV === 'production'
          ? "L'agrégateur simulé (fake) est interdit en production : renseigner PAYMENT_PROVIDER."
          : 'FAKE_PAYMENT_WEBHOOK_SECRET manquant (min. 32 caractères ; openssl rand -hex 32).'
        : `Agrégateur de paiement inconnu : ${env.PAYMENT_PROVIDER}.`,
    );
  }
  return new Registry(providers, active);
}
