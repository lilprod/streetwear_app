import { describe, expect, it } from 'vitest';
import { FIXTURE_PATTERNS_BY_ID, FIXTURE_PRICE_RULES, VALID_DESIGNS } from '../fixtures';
import type { DesignSpec } from '../design-spec';
import {
  computeCartTotals,
  computeDepositXof,
  computeUnitPriceXof,
  computeVatIncludedXof,
} from './index';

const rules = FIXTURE_PRICE_RULES;
const design = (k: string) => VALID_DESIGNS[k] as DesignSpec;
describe('computeUnitPriceXof', () => {
  it('prices premium pattern only', () => {
    expect(computeUnitPriceXof(design('patternOnly'), rules, FIXTURE_PATTERNS_BY_ID)).toBe(11000);
  });
  it('prices standard pattern plus text once', () => {
    expect(computeUnitPriceXof(design('patternAndText'), rules, FIXTURE_PATTERNS_BY_ID)).toBe(
      11000,
    );
  });
  it('sums patterns over both zones, with Map lookup', () => {
    const map = new Map(Object.entries(FIXTURE_PATTERNS_BY_ID));
    expect(computeUnitPriceXof(design('frontBackTiled'), rules, map)).toBe(8500 + 2500 + 1500);
  });
  it('adds text on text-only designs', () => {
    const spec = {
      version: 1 as const,
      colorId: 'c',
      zones: {
        back: {
          layers: [
            {
              type: 'text' as const,
              id: 'x',
              text: 'A',
              fontId: 'f',
              colorHex: '#000000',
              sizeMm: 10,
              x: 1,
              y: 1,
              rotation: 0,
              align: 'center' as const,
            },
          ],
        },
      },
    };
    expect(computeUnitPriceXof(spec, rules, {})).toBe(9500);
  });
  it('throws on unknown pattern, including prototype keys, and bad rules', () => {
    expect(() => computeUnitPriceXof(design('patternOnly'), rules, {})).toThrow('Motif inconnu');
    const spec = structuredClone(design('patternOnly'));
    const front = spec.zones.front as { layers: object[] };
    front.layers[0] = { ...front.layers[0], patternId: 'toString' };
    expect(() => computeUnitPriceXof(spec, rules, {})).toThrow('Motif inconnu');
    expect(() =>
      computeUnitPriceXof(
        design('patternOnly'),
        { ...rules, baseXof: 1.5 },
        FIXTURE_PATTERNS_BY_ID,
      ),
    ).toThrow();
  });
});

describe('computeVatIncludedXof', () => {
  it('rounds total x 18 / 118', () => {
    expect(computeVatIncludedXof(11800)).toBe(1800);
    expect(computeVatIncludedXof(10000)).toBe(1525);
    expect(computeVatIncludedXof(0)).toBe(0);
  });
  it('rejects non-integers and negatives', () => {
    expect(() => computeVatIncludedXof(10.5)).toThrow(RangeError);
    expect(() => computeVatIncludedXof(-1)).toThrow(RangeError);
  });
});

describe('computeDepositXof', () => {
  it('rounds up to the next hundred', () => {
    expect(computeDepositXof(34000, 50)).toBe(17000);
    expect(computeDepositXof(33500, 50)).toBe(16800);
    expect(computeDepositXof(10001, 30)).toBe(3100);
  });
  it('caps at the total and validates percent', () => {
    expect(computeDepositXof(120, 100)).toBe(120);
    expect(computeDepositXof(0, 50)).toBe(0);
    expect(() => computeDepositXof(1000, 0)).toThrow(RangeError);
    expect(() => computeDepositXof(1000, 101)).toThrow(RangeError);
    expect(() => computeDepositXof(1000, 12.5)).toThrow(RangeError);
    expect(() => computeDepositXof(1000.5, 50)).toThrow(RangeError);
  });
});

describe('computeCartTotals', () => {
  it('adds delivery once', () => {
    const t = computeCartTotals(
      [
        { unitPriceXof: 11000, quantity: 2 },
        { unitPriceXof: 9500, quantity: 1 },
      ],
      1500,
    );
    expect(t).toEqual({
      subtotalXof: 31500,
      deliveryFeeXof: 1500,
      totalXof: 33000,
      vatIncludedXof: computeVatIncludedXof(33000),
      itemCount: 3,
    });
  });
  it('handles empty carts and rejects invalid lines', () => {
    expect(computeCartTotals([], 1500).totalXof).toBe(0);
    expect(() => computeCartTotals([{ unitPriceXof: 1000, quantity: 0 }], 0)).toThrow(RangeError);
    expect(() => computeCartTotals([{ unitPriceXof: 1000, quantity: 51 }], 0)).toThrow(RangeError);
    expect(() => computeCartTotals([{ unitPriceXof: 1000, quantity: 1.5 }], 0)).toThrow(RangeError);
    expect(() => computeCartTotals([{ unitPriceXof: -1, quantity: 1 }], 0)).toThrow(RangeError);
    expect(() => computeCartTotals([{ unitPriceXof: 1, quantity: 1 }], -5)).toThrow(RangeError);
  });
});
