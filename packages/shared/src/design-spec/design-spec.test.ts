import { describe, expect, it } from 'vitest';
import { INVALID_DESIGNS, VALID_DESIGNS, uid } from '../fixtures';
import {
  DEFAULT_PRINT_ZONES,
  PrintZonesSchema,
  layerBoundingBox,
  migrateSpec,
  validateDesignSpec,
  type Layer,
} from './index';

const square = (size: number, rotation: number, x = 8.5, y = 70): Layer => ({
  type: 'pattern',
  id: uid(1),
  patternId: 'p',
  x,
  y,
  width: size,
  height: size,
  rotation,
  repeat: 'none',
  tileScale: 1,
});
const specOf = (layer: object) => ({
  version: 1,
  colorId: 'c',
  zones: { front: { layers: [layer] } },
});
const text = (over: Record<string, unknown> = {}) => ({
  type: 'text',
  id: uid(2),
  text: 'HELLO',
  fontId: 'f',
  colorHex: '#aabbcc',
  sizeMm: 20,
  x: 148.5,
  y: 200,
  rotation: 0,
  align: 'center',
  ...over,
});
const textSpec = (over: Record<string, unknown> = {}) => ({
  version: 1,
  colorId: 'c',
  zones: { front: { layers: [text(over)] } },
});

describe('validateDesignSpec', () => {
  it.each(Object.entries(VALID_DESIGNS))('accepts valid fixture %s', (_n, spec) => {
    expect(validateDesignSpec(spec).ok).toBe(true);
  });

  it.each(INVALID_DESIGNS)('rejects invalid fixture: $name', (f) => {
    const r = validateDesignSpec(f.spec);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(f.expectedCode);
      expect(r.errors[0]?.message).toContain(f.expectedMessage);
    }
  });

  it('rejects a 280 mm square rotated 45 degrees but accepts it unrotated', () => {
    expect(validateDesignSpec(specOf(square(280, 45))).ok).toBe(false);
    expect(validateDesignSpec(specOf(square(280, 0))).ok).toBe(true);
  });

  it('rejects negative origin and overflow on each side', () => {
    expect(validateDesignSpec(specOf(square(100, 0, -1, 10))).ok).toBe(false);
    expect(validateDesignSpec(specOf(square(100, 0, 10, -1))).ok).toBe(false);
    expect(validateDesignSpec(specOf(square(100, 0, 198, 10))).ok).toBe(false);
    expect(validateDesignSpec(specOf(square(100, 0, 10, 321))).ok).toBe(false);
    expect(validateDesignSpec(specOf(square(100, 0, 197, 320))).ok).toBe(true);
  });

  it('honours overridden zones', () => {
    const zones = { ...DEFAULT_PRINT_ZONES, front: { widthMm: 200, heightMm: 300 } };
    expect(validateDesignSpec(specOf(square(250, 0, 0, 0)), zones).ok).toBe(false);
    expect(PrintZonesSchema.safeParse(zones).success).toBe(true);
  });

  it('checks the back zone with its own label', () => {
    const r = validateDesignSpec({
      version: 1,
      colorId: 'c',
      zones: { back: { layers: [square(300, 0, 0, 0)] } },
    });
    expect(r.ok === false && r.errors[0]?.message).toContain('arrière');
  });

  it('rejects text issues: size, length, emoji, blank, color, controls', () => {
    expect(validateDesignSpec(textSpec()).ok).toBe(true);
    expect(validateDesignSpec(textSpec({ sizeMm: 7.9 })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ sizeMm: 81 })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: 'ABCDEFGHIJKLMNO', sizeMm: 8 })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: 'A😀' })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: '👍🏽' })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: 'A\u200dB' })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: '   ' })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: 'A\nB' })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ colorHex: 'red' })).ok).toBe(false);
    expect(validateDesignSpec(textSpec({ text: 'LOMÉ' })).ok).toBe(true);
  });

  it('refuses a text box that sticks out of the zone', () => {
    const r = validateDesignSpec(textSpec({ text: 'ABCDEFGHIJKLMN', sizeMm: 30 }));
    expect(r.ok === false && r.errors[0]?.code).toBe('LAYER_OUT_OF_ZONE');
  });

  it('rejects duplicate layer ids, unknown keys, bad rotation, bad format', () => {
    const dup = {
      version: 1,
      colorId: 'c',
      zones: {
        front: { layers: [square(50, 0)] },
        back: { layers: [square(50, 0)] },
      },
    };
    const r = validateDesignSpec(dup);
    expect(r.ok === false && r.errors[0]?.code).toBe('DUPLICATE_LAYER_ID');
    expect(validateDesignSpec({ ...specOf(square(50, 0)), extra: 1 }).ok).toBe(false);
    expect(validateDesignSpec(specOf(square(50, 181))).ok).toBe(false);
    expect(validateDesignSpec(specOf({ ...square(50, 0), tileScale: 5 })).ok).toBe(false);
    expect(validateDesignSpec(specOf({ ...square(50, 0), width: 0 })).ok).toBe(false);
    expect(validateDesignSpec({ version: 2 }).ok).toBe(false);
    expect(
      validateDesignSpec({ version: 1, colorId: 'c', zones: { front: { layers: [] } } }).ok,
    ).toBe(false);
    expect(validateDesignSpec(null).ok).toBe(false);
  });
});

describe('layerBoundingBox', () => {
  it('returns the layer rect when not rotated', () => {
    expect(layerBoundingBox(square(100, 0, 10, 20))).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    });
  });
  it('grows a square rotated by 45 degrees', () => {
    const b = layerBoundingBox(square(100, 45, 0, 0));
    expect(b.width).toBeCloseTo(141.42, 2);
    expect(b.x).toBeCloseTo(50 - 70.71, 2);
  });
  it('swaps sides at 90 degrees', () => {
    const l = { ...square(100, 90, 0, 0), height: 40 };
    const b = layerBoundingBox(l);
    expect(b.width).toBeCloseTo(40);
    expect(b.height).toBeCloseTo(100);
  });
  it('estimates a centered text box', () => {
    const b = layerBoundingBox(text({ text: 'ABCD', sizeMm: 10, x: 100, y: 100 }) as Layer);
    expect(b).toEqual({ x: 80, y: 93, width: 40, height: 14 });
  });
});

describe('migrateSpec', () => {
  it('keeps a v1 spec', () => {
    expect(migrateSpec(VALID_DESIGNS.patternOnly)).toEqual(VALID_DESIGNS.patternOnly);
  });
  it('rejects unknown versions and invalid v1', () => {
    expect(() => migrateSpec({ version: 9 })).toThrow('Version de design');
    expect(() => migrateSpec(null)).toThrow();
    expect(() => migrateSpec({ version: 1 })).toThrow();
  });
});
