import { assertNotProduction } from '../src/seed/demo';

describe('demo seed guard', () => {
  it('refuses to run when NODE_ENV=production', () => {
    expect(() => assertNotProduction({ NODE_ENV: 'production' })).toThrow(/interdit/);
  });
  it('is allowed in development and test', () => {
    expect(() => assertNotProduction({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertNotProduction({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertNotProduction({})).not.toThrow();
  });
});
