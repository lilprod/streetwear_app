import { scrub } from './sentry';

describe('scrub', () => {
  it('masks phone, address and landmark at any depth', () => {
    const out = scrub({
      a: { phone: '+22890123456', list: [{ address: 'x' }] },
      landmark: 'y',
      ok: 1,
    });
    expect(out).toEqual({
      a: { phone: '[masqué]', list: [{ address: '[masqué]' }] },
      landmark: '[masqué]',
      ok: 1,
    });
  });
});
