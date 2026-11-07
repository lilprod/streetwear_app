import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import type { DesignSpec } from '@streetwear/shared';
import type { RenderAssets } from '../src/modules/production/render/render-zone';

export const TEST_FONT = readFileSync(`${__dirname}/fixtures/DejaVuSans-Bold.ttf`);

/** Motif factice entièrement opaque : moitié gauche rouge, moitié droite bleue. */
export function patternPng(size = 400): Buffer {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d02020';
  ctx.fillRect(0, 0, size / 2, size);
  ctx.fillStyle = '#2040d0';
  ctx.fillRect(size / 2, 0, size / 2, size);
  return c.toBuffer('image/png');
}

/** Assets factices pour tous les motifs et polices référencés par un design. */
export function assetsFor(spec: DesignSpec, size = 400): RenderAssets {
  const patterns: Record<string, Buffer> = {};
  const fonts: Record<string, Buffer> = {};
  const png = patternPng(size);
  for (const zone of Object.values(spec.zones)) {
    for (const layer of zone?.layers ?? []) {
      if (layer.type === 'pattern') patterns[layer.patternId] = png;
      else fonts[layer.fontId] = TEST_FONT;
    }
  }
  return { patterns, fonts };
}
