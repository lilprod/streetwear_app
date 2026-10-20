import { scrub } from './scrub';

describe('scrub', () => {
  it('masks phone, address and landmark', () => {
    expect(
      scrub({ user: { phone: '+22890123456' }, items: [{ address: 'a' }], landmark: 'b' }),
    ).toEqual({
      user: { phone: '[masqué]' },
      items: [{ address: '[masqué]' }],
      landmark: '[masqué]',
    });
  });
});
