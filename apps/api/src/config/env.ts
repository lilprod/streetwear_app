import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    SENTRY_DSN: z.string().default(''),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(100),
    GOOGLE_CLIENT_ID: z.string().default(''),
    APPLE_CLIENT_ID: z.string().default(''),
    SEED_ADMIN_EMAIL: z.string().default(''),
    SEED_ADMIN_PASSWORD: z.string().default(''),
    MEDIA_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
    MEDIA_BASE_URL: z.string().default('http://localhost:3000/media'),
    MEDIA_UPLOAD_URL: z.string().default('/v1/admin/media/upload'),
    CLOUDINARY_CLOUD_NAME: z.string().default(''),
    CLOUDINARY_API_KEY: z.string().default(''),
    CLOUDINARY_API_SECRET: z.string().default(''),
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    STORAGE_BASE_URL: z.string().default('http://localhost:3000/storage'),
    S3_BUCKET: z.string().default(''),
    S3_REGION: z.string().default('auto'),
    S3_ENDPOINT: z.string().default(''),
    S3_ACCESS_KEY_ID: z.string().default(''),
    S3_SECRET_ACCESS_KEY: z.string().default(''),
    ASSET_CACHE_DIR: z.string().default('.asset-cache'),
    BRAND_NAME: z.string().trim().min(1).max(20).default('Streetwear'),
    NOTIFICATION_CODE_KEY: z.string().default(''),
    PUSH_PROVIDER: z.enum(['expo', 'fake']).default('fake'),
    EXPO_ACCESS_TOKEN: z.string().default(''),
    EMAIL_PROVIDER: z.enum(['smtp', 'fake']).default('fake'),
    SMTP_URL: z.string().default(''),
    EMAIL_FROM: z.string().default(''),
    PAYMENT_RETURN_URL: z.string().url().default('streetwear://paiement/retour'),
  })
  .superRefine((env, ctx) => {
    const need = (ok: boolean, path: string, message: string): void => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    need(
      env.NOTIFICATION_CODE_KEY === '' || env.NOTIFICATION_CODE_KEY.length >= 32,
      'NOTIFICATION_CODE_KEY',
      'au moins 32 caractères (ou vide)',
    );
    need(
      env.NODE_ENV !== 'production' || env.NOTIFICATION_CODE_KEY !== '',
      'NOTIFICATION_CODE_KEY',
      'requis en production (clé distincte de JWT_SECRET)',
    );
    if (env.EMAIL_PROVIDER === 'smtp') {
      need(env.SMTP_URL !== '', 'SMTP_URL', 'requis avec EMAIL_PROVIDER=smtp');
      need(env.EMAIL_FROM !== '', 'EMAIL_FROM', 'requis avec EMAIL_PROVIDER=smtp');
    }
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
