/** Environnement des tests : fixé ici, jamais lu depuis apps/api/.env ni le shell (hors bases de test). */
const fixed: Record<string, string> = {
  NODE_ENV: 'test',
  RATE_LIMIT_PER_MINUTE: '1000000',
  RATE_LIMIT_OTP_PER_MINUTE: '1000000',
  RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE: '1000000',
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
  'TRUST_PROXY',
  'SMTP_URL',
  'EXPO_ACCESS_TOKEN',
]) {
  Reflect.deleteProperty(process.env, k);
}
// Prisma sizes its pool from the CPU count (2 vCPU on GitHub runners → 5 connections). Concurrent
// order tests hold one connection per transaction waiting on the stock row lock, so a small pool
// times out (P2024). Tests get an explicit pool unless the URL already sets one.
const withPool = (url: string): string =>
  /[?&]connection_limit=/.test(url)
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}connection_limit=25&pool_timeout=20`;
process.env.DATABASE_URL = withPool(
  process.env.TEST_DATABASE_URL ??
    'postgresql://streetwear:streetwear@localhost:5432/streetwear_test',
);
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
