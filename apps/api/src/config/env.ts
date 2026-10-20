import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  SENTRY_DSN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new EnvValidationError(
      `Variables d'environnement invalides ou manquantes :\n${lines.join('\n')}\n` +
        'Voir apps/api/.env.example.',
    );
  }
  return result.data;
}

export const ENV = Symbol('ENV');
