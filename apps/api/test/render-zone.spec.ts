import { def } from './def';
import sharp from 'sharp';
import {
  DEFAULT_PRINT_ZONES,
  VALID_DESIGNS,
  layerBoundingBox,
  type DesignSpec,
  type PatternLayer,
  type Zone,
} from '@streetwear/shared';
import {
  PRINT_DPI,
  RenderError,
  renderZone,
  renderZoneDetailed,
} from '../src/modules/production/render/render-zone';
import { readTextChunk } from '../src/modules/production/render/png-chunks';
import { assetsFor, patternPng } from './render-fixtures';

const PPM = PRINT_DPI / 25.4;
const TOLERANCE_MM = 1;

async function opaqueBoxPx(png: Buffer) {
  const { data, info } = await sharp(png)
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x++) {
      if (def(data[row + x]) > 127) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

const zones = (spec: DesignSpec) =>
  (['front', 'back'] as const).flatMap((n) =>
    spec.zones[n] ? [[n, def(spec.zones[n])] as const] : [],
  );

describe('renderZone (SP08, US-12)', () => {
  describe.each(Object.entries(VALID_DESIGNS))('fidelity: %s', (_name, spec) => {
    it.each(zones(spec).map(([n, z]) => [n, z] as [string, Zone]))(
      'zone %s: opaque area matches layerBoundingBox within 1 mm',
      async (_n, zone) => {
        const assets = assetsFor(spec);
        const out = await renderZoneDetailed(zone, assets, PRINT_DPI, DEFAULT_PRINT_ZONES.front);
        const box = await opaqueBoxPx(out.png);
        const ox = Math.round(out.cropMm.x * PPM);
        const oy = Math.round(out.cropMm.y * PPM);
        const got = {
          x0: (box.x0 + ox) / PPM,
          y0: (box.y0 + oy) / PPM,
          x1: (box.x1 + ox) / PPM,
          y1: (box.y1 + oy) / PPM,
        };
        const boxes = zone.layers.map(layerBoundingBox);
        const exp = {
          x0: Math.min(...boxes.map((b) => b.x)),
          y0: Math.min(...boxes.map((b) => b.y)),
          x1: Math.max(...boxes.map((b) => b.x + b.width)),
          y1: Math.max(...boxes.map((b) => b.y + b.height)),
        };
        const hasText = zone.layers.some((l) => l.type === 'text');
        if (hasText) {
          // Le texte est estimé par une boîte majorante : l'encre doit rester dedans.
          expect(got.x0).toBeGreaterThanOrEqual(exp.x0 - TOLERANCE_MM);
          expect(got.y0).toBeGreaterThanOrEqual(exp.y0 - TOLERANCE_MM);
          expect(got.x1).toBeLessThanOrEqual(exp.x1 + TOLERANCE_MM);
          expect(got.y1).toBeLessThanOrEqual(exp.y1 + TOLERANCE_MM);
        } else {
          expect(Math.abs(got.x0 - exp.x0)).toBeLessThanOrEqual(TOLERANCE_MM);
          expect(Math.abs(got.y0 - exp.y0)).toBeLessThanOrEqual(TOLERANCE_MM);
          expect(Math.abs(got.x1 - exp.x1)).toBeLessThanOrEqual(TOLERANCE_MM);
          expect(Math.abs(got.y1 - exp.y1)).toBeLessThanOrEqual(TOLERANCE_MM);
        }
      },
    );
  });

  it('text ink stays inside the estimated box and is not empty', async () => {
    const spec = def(VALID_DESIGNS.patternAndText);
    const text = { layers: [def(def(spec.zones.front).layers[1])] };
    const out = await renderZoneDetailed(text, assetsFor(spec));
    const box = await opaqueBoxPx(out.png);
    expect(box.x1 - box.x0).toBeGreaterThan(50);
    const b = layerBoundingBox(def(text.layers[0]));
    expect((box.x1 - box.x0) / PPM).toBeLessThanOrEqual(b.width + 2 * TOLERANCE_MM);
    expect((box.y1 - box.y0) / PPM).toBeLessThanOrEqual(b.height + 2 * TOLERANCE_MM);
  });

  it('full A3 zone: 3508 px for 297 mm, 300 DPI, sRGB, RGBA, crop note', async () => {
    const spec = def(VALID_DESIGNS.frontBackTiled);
    const png = await renderZone(def(spec.zones.front), assetsFor(spec));
    const meta = await sharp(png).metadata();
    expect(Math.abs(def(meta.width) - 3508)).toBeLessThanOrEqual(1);
    expect(Math.abs(def(meta.height) - 4961)).toBeLessThanOrEqual(1);
    expect(meta.density).toBe(300);
    expect(meta.channels).toBe(4);
    expect(meta.hasAlpha).toBe(true);
    expect(meta.depth).toBe('uchar');
    expect(meta.icc).toBeDefined();
    expect(readTextChunk(png, 'StreetwearCrop')).toContain('crop=0.00,0.00,297.00,420.00mm');
  });

  it('crops to bounding box plus 5 mm', async () => {
    const spec = def(VALID_DESIGNS.patternOnly);
    const out = await renderZoneDetailed(def(spec.zones.front), assetsFor(spec));
    expect(out.cropMm).toEqual({ x: 15, y: 35, width: 260, height: 260 });
    expect(out.widthPx).toBe(Math.round(260 * PPM));
  });

  it('tile layer repeats the module at tileScale x native size', async () => {
    const layer: PatternLayer = {
      type: 'pattern',
      id: 'l',
      patternId: 'p',
      x: 10,
      y: 10,
      width: 60,
      height: 20,
      rotation: 0,
      repeat: 'tile',
      tileScale: 1,
    };
    const out = await renderZoneDetailed(
      { layers: [layer] },
      { patterns: { p: patternPng(100) }, fonts: {} },
    );
    const { data, info } = await sharp(out.png).raw().toBuffer({ resolveWithObject: true });
    const margin = Math.round(5 * PPM);
    const at = (x: number) => {
      const i = ((margin + 10) * info.width + margin + x) * 4;
      return [data[i], data[i + 2]] as const;
    };
    expect(at(25)[0]).toBeGreaterThan(150);
    expect(at(75)[1]).toBeGreaterThan(150);
    expect(at(125)[0]).toBeGreaterThan(150);
    expect(at(175)[1]).toBeGreaterThan(150);
  });

  it('rotated pattern swaps width and height of the opaque area', async () => {
    const layer: PatternLayer = {
      type: 'pattern',
      id: 'l',
      patternId: 'p',
      x: 48.5,
      y: 50,
      width: 200,
      height: 100,
      rotation: 90,
      repeat: 'none',
      tileScale: 1,
    };
    const out = await renderZoneDetailed(
      { layers: [layer] },
      { patterns: { p: patternPng() }, fonts: {} },
    );
    const box = await opaqueBoxPx(out.png);
    expect((box.x1 - box.x0) / PPM).toBeCloseTo(100, 0);
    expect((box.y1 - box.y0) / PPM).toBeCloseTo(200, 0);
  });

  it('fails cleanly on a missing pattern or font', async () => {
    const spec = def(VALID_DESIGNS.patternAndText);
    const zone = def(spec.zones.front);
    await expect(renderZone(zone, { patterns: {}, fonts: {} })).rejects.toMatchObject({
      code: 'PATTERN_ASSET_MISSING',
    });
    const assets = assetsFor(spec);
    await expect(renderZone(zone, { patterns: assets.patterns, fonts: {} })).rejects.toBeInstanceOf(
      RenderError,
    );
    await expect(
      renderZone(zone, { patterns: { 'pat-losanges': Buffer.from('nope') }, fonts: assets.fonts }),
    ).rejects.toMatchObject({ code: 'ASSET_INVALID' });
  });
});
