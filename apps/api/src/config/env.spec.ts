import { EnvValidationError, parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.SENTRY_DSN).toBe('');
  });

  it('names every missing variable', () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*JWT_SECRET/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
