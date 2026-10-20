process.env.NODE_ENV = 'test';
try {
  process.loadEnvFile(`${__dirname}/../.env`);
} catch {
  // pas de fichier .env local
}
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://streetwear:streetwear@localhost:5432/streetwear_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.RATE_LIMIT_PER_MINUTE = '1000';
process.env.JWT_SECRET ??= 'test-only-secret-not-for-production-use';
