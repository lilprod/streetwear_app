process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://streetwear:streetwear@localhost:5432/streetwear_test';
process.env.REDIS_URL ??= 'redis://localhost:6379/1';
process.env.JWT_SECRET ??= 'test-only-secret-not-for-production-use';
