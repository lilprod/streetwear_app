/** Environnement des tests : fixé ici, jamais lu depuis apps/api/.env ni le shell (hors bases de test). */
const fixed: Record<string, string> = {
  NODE_ENV: 'test',
  RATE_LIMIT_PER_MINUTE: '1000',
  JWT_SECRET: 'test-only-secret-not-for-production-use',
  PAYMENT_PROVIDER: 'fake',
  FAKE_PAYMENT_WEBHOOK_SECRET: 'test-only-fake-payment-webhook-secret-0000',
  PUSH_PROVIDER: 'fake',
  EMAIL_PROVIDER: 'fake',
  MEDIA_PROVIDER: 'local',
  STORAGE_PROVIDER: 'local',
  BRAND_NAME: 'Streetwear',
};
Object.assign(process.env, fixed);
for (const k of [
  'NOTIFICATION_CODE_KEY',
  'FAKE_PAYMENT_WEBHOOK_URL',
  'FAKE_PAYMENT_DELAY_MS',
  'MEDIA_BASE_URL',
  'MEDIA_UPLOAD_URL',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
  'SENTRY_DSN',
  'SMTP_URL',
  'EXPO_ACCESS_TOKEN',
]) {
  Reflect.deleteProperty(process.env, k);
}
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://streetwear:streetwear@localhost:5432/streetwear_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
