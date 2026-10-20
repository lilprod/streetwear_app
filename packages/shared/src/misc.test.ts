import { describe, expect, it } from 'vitest';
import {
  AddressInputSchema,
  ApiErrorSchema,
  CourierFailInputSchema,
  CreateDesignInputSchema,
  CreateOrderInputSchema,
  CreatePaymentInputSchema,
  DesignPreviewsInputSchema,
  FIXTURE_DESIGNS,
  FIXTURE_ORDERS,
  OrderSchema,
  DesignSchema,
  OtpVerifyInputSchema,
  PageQuerySchema,
  StockMovementInputSchema,
  VALID_DESIGNS,
  containsBannedWord,
  formatLome,
  formatTgPhone,
  formatXof,
  isValidTgPhone,
  normalizeForModeration,
  normalizeTgPhone,
  pageSchema,
  uid,
} from './index';

describe('money', () => {
  it('formats with narrow no-break spaces (U+202F)', () => {
    expect(formatXof(12000)).toBe('12\u202f000\u202fFCFA');
    expect(formatXof(0)).toBe('0\u202fFCFA');
    expect(formatXof(1234567)).toBe('1\u202f234\u202f567\u202fFCFA');
    expect(formatXof(-500)).toBe('-500\u202fFCFA');
    expect(() => formatXof(1.5)).toThrow(RangeError);
  });
});

describe('phone', () => {
  it.each([
    '90 12 34 56',
    '+228 90 12 34 56',
    '+22890123456',
    '0022890123456',
    '22890123456',
    '90.12.34.56',
    '90-12-34-56',
  ])('normalizes %s', (v) => expect(normalizeTgPhone(v)).toBe('+22890123456'));
  it.each([
    '9012345',
    '901234567',
    '+33612345678',
    'abc',
    '',
    '+228 9012345',
    '+2289012345678',
    '00133 90123456',
    '228 9012345',
  ])('refuses %s', (v) => {
    expect(normalizeTgPhone(v)).toBeNull();
    expect(isValidTgPhone(v)).toBe(false);
  });
  it('refuses non-strings and formats for display', () => {
    expect(normalizeTgPhone(null as never)).toBeNull();
    expect(formatTgPhone('+22890123456')).toBe('+228 90 12 34 56');
    expect(formatTgPhone('90123456')).toBe('+228 90 12 34 56');
    expect(() => formatTgPhone('123')).toThrow(RangeError);
    expect(isValidTgPhone('90123456')).toBe(true);
  });
});

describe('dates', () => {
  it('formats in Africa/Lome', () => {
    const d = '2026-11-23T14:02:00Z';
    expect(formatLome(d, 'date')).toBe('23/11/2026');
    expect(formatLome(d, 'time')).toBe('14:02');
    expect(formatLome(d)).toBe('23/11/2026 14:02');
    expect(formatLome(new Date(d), 'long')).toBe('23 novembre 2026');
    expect(formatLome('2026-11-23T00:05:00Z', 'time')).toBe('00:05');
    expect(() => formatLome('nope')).toThrow(RangeError);
  });
});

describe('text moderation', () => {
  it('normalizes', () => {
    expect(normalizeForModeration('  Éléphant,  GÉANT !! ')).toBe('elephant geant');
  });
  it('detects banned words ignoring accents, case, punctuation and spacing', () => {
    expect(containsBannedWord('Mérde', ['merde'])).toBe(true);
    expect(containsBannedWord('M.E.R.D.E', ['merde'])).toBe(true);
    expect(containsBannedWord('m e r d e', ['merde'])).toBe(true);
    expect(containsBannedWord('Salut', ['merde', ''])).toBe(false);
    expect(containsBannedWord('Salut', [])).toBe(false);
  });
});

describe('contracts', () => {
  it('validates fixtures against contract schemas', () => {
    for (const o of FIXTURE_ORDERS) expect(OrderSchema.safeParse(o).success).toBe(true);
    for (const d of FIXTURE_DESIGNS) expect(DesignSchema.safeParse(d).success).toBe(true);
  });
  it('normalizes phones in inputs and rejects bad ones', () => {
    const base = { label: 'Maison', lat: 6.1, lng: 1.2, district: 'Bè', landmark: 'Marché' };
    const r = AddressInputSchema.parse({ ...base, recipientPhone: '90 12 34 56' });
    expect(r.recipientPhone).toBe('+22890123456');
    expect(AddressInputSchema.safeParse({ ...base, recipientPhone: '123' }).success).toBe(false);
    expect(
      AddressInputSchema.safeParse({ ...base, recipientPhone: '90123456', lat: 91 }).success,
    ).toBe(false);
    expect(OtpVerifyInputSchema.safeParse({ phone: '90123456', code: '12345' }).success).toBe(
      false,
    );
  });
  it('validates order and payment inputs', () => {
    const reception = { type: 'pickup', storeId: uid(1), slotId: uid(2) };
    expect(CreateOrderInputSchema.safeParse({ reception, paymentMethod: 'cod' }).success).toBe(
      true,
    );
    expect(CreateOrderInputSchema.safeParse({ reception, paymentMethod: 'cash' }).success).toBe(
      false,
    );
    expect(
      CreateOrderInputSchema.safeParse({ reception: { type: 'home' }, paymentMethod: 'card' })
        .success,
    ).toBe(false);
    expect(CreatePaymentInputSchema.safeParse({ method: 'card' }).success).toBe(true);
    expect(CreatePaymentInputSchema.safeParse({ method: 'flooz' }).success).toBe(false);
    expect(
      CreatePaymentInputSchema.safeParse({ method: 'flooz', payerPhone: '90123456' }).success,
    ).toBe(true);
  });
  it('validates designs, previews, stock, courier inputs', () => {
    expect(CreateDesignInputSchema.safeParse({ spec: VALID_DESIGNS.patternOnly }).success).toBe(
      true,
    );
    expect(CreateDesignInputSchema.safeParse({ spec: { version: 1 } }).success).toBe(false);
    expect(DesignPreviewsInputSchema.safeParse({}).success).toBe(false);
    expect(DesignPreviewsInputSchema.safeParse({ front: 'iVBORw0KGgo=' }).success).toBe(true);
    expect(DesignPreviewsInputSchema.safeParse({ front: 'x'.repeat(700_000) }).success).toBe(false);
    expect(DesignPreviewsInputSchema.safeParse({ front: '***' }).success).toBe(false);
    const mv = { colorId: 'c', size: 'M', note: 'ok' };
    expect(StockMovementInputSchema.safeParse({ ...mv, type: 'in', quantity: 5 }).success).toBe(
      true,
    );
    expect(StockMovementInputSchema.safeParse({ ...mv, type: 'in', quantity: -5 }).success).toBe(
      false,
    );
    expect(
      StockMovementInputSchema.safeParse({ ...mv, type: 'adjust', quantity: -2 }).success,
    ).toBe(true);
    expect(StockMovementInputSchema.safeParse({ ...mv, type: 'adjust', quantity: 0 }).success).toBe(
      false,
    );
    expect(CourierFailInputSchema.safeParse({ reason: 'other' }).success).toBe(false);
    expect(CourierFailInputSchema.safeParse({ reason: 'absent' }).success).toBe(true);
  });
  it('handles errors and pages', () => {
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Introuvable' } }).success,
    ).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(false);
    expect(PageQuerySchema.parse({}).limit).toBe(20);
    expect(PageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(
      pageSchema(OrderSchema.shape.number).safeParse({ items: ['TG-000001'], nextCursor: null })
        .success,
    ).toBe(true);
  });
});
