import { createHash } from 'node:crypto';
import { GlobalFonts, createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import sharp from 'sharp';
import {
  DEFAULT_PRINT_ZONES,
  TEXT_BOX_HEIGHT_FACTOR,
  TEXT_CHAR_WIDTH_FACTOR,
  layerBoundingBox,
  type BoundingBox,
  type Layer,
  type PatternLayer,
  type PrintZoneSize,
  type TextLayer,
  type Zone,
} from '@streetwear/shared';
import { embedTextChunk } from './png-chunks';

export const PRINT_DPI = 300;
export const CROP_MARGIN_MM = 5;
const MM_PER_INCH = 25.4;

export interface RenderAssets {
  /** Image du motif en pleine résolution (PNG, JPEG ou SVG), par `patternId`. */
  patterns: Readonly<Record<string, Buffer>>;
  /** Fichier de police (TTF, OTF, WOFF2), par `fontId`. */
  fonts: Readonly<Record<string, Buffer>>;
}

export class RenderError extends Error {
  constructor(
    readonly code: 'PATTERN_ASSET_MISSING' | 'FONT_ASSET_MISSING' | 'ASSET_INVALID' | 'EMPTY_ZONE',
    message: string,
  ) {
    super(message);
  }
}

export interface RenderedZone {
  png: Buffer;
  widthPx: number;
  heightPx: number;
  /** Rectangle recadré, en mm relatifs à la zone. */
  cropMm: BoundingBox;
}

const union = (boxes: BoundingBox[]): BoundingBox => {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/** Boîte englobante des calques + marge, bornée au cadre d'impression. */
export function cropBox(layers: readonly Layer[], zone: PrintZoneSize): BoundingBox {
  const u = union(layers.map(layerBoundingBox));
  const x0 = Math.max(0, u.x - CROP_MARGIN_MM);
  const y0 = Math.max(0, u.y - CROP_MARGIN_MM);
  const x1 = Math.min(zone.widthMm, u.x + u.width + CROP_MARGIN_MM);
  const y1 = Math.min(zone.heightMm, u.y + u.height + CROP_MARGIN_MM);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const fontFamilyOf = (data: Buffer): string => {
  const family = `sw-${createHash('sha1').update(data).digest('hex').slice(0, 16)}`;
  if (!GlobalFonts.has(family)) {
    if (!GlobalFonts.register(data, family)) {
      throw new RenderError('ASSET_INVALID', 'Fichier de police illisible.');
    }
  }
  return family;
};

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function drawPattern(
  ctx: Ctx,
  layer: PatternLayer,
  img: Image,
  ppm: number,
  originPx: { x: number; y: number },
  dpi: number,
): void {
  const w = layer.width * ppm;
  const h = layer.height * ppm;
  ctx.save();
  ctx.translate(
    (layer.x + layer.width / 2) * ppm - originPx.x,
    (layer.y + layer.height / 2) * ppm - originPx.y,
  );
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  if (layer.repeat === 'tile') {
    const k = layer.tileScale * (dpi / PRINT_DPI);
    const mw = img.width * k;
    const mh = img.height * k;
    for (let ty = -h / 2; ty < h / 2; ty += mh) {
      for (let tx = -w / 2; tx < w / 2; tx += mw) ctx.drawImage(img, tx, ty, mw, mh);
    }
  } else {
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

function drawText(
  ctx: Ctx,
  layer: TextLayer,
  family: string,
  ppm: number,
  originPx: { x: number; y: number },
): void {
  const REF = 200;
  ctx.font = `${REF}px "${family}"`;
  const capRatio = ctx.measureText('H').actualBoundingBoxAscent / REF || 0.7;
  const capPx = layer.sizeMm * ppm;
  const fontPx = capPx / capRatio;
  ctx.font = `${fontPx}px "${family}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = layer.colorHex;
  const m = ctx.measureText(layer.text);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const boxW = [...layer.text].length * layer.sizeMm * TEXT_CHAR_WIDTH_FACTOR * ppm;
  const boxH = layer.sizeMm * TEXT_BOX_HEIGHT_FACTOR * ppm;
  const sx = inkW > boxW ? boxW / inkW : 1;
  let baseline = capPx / 2;
  const top = baseline - m.actualBoundingBoxAscent;
  const bottom = baseline + m.actualBoundingBoxDescent;
  if (top < -boxH / 2) baseline += -boxH / 2 - top;
  else if (bottom > boxH / 2) baseline -= bottom - boxH / 2;
  ctx.save();
  ctx.translate(layer.x * ppm - originPx.x, layer.y * ppm - originPx.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(sx, 1);
  ctx.fillText(layer.text, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, baseline);
  ctx.restore();
}

/**
 * Rend une zone en PNG RGBA transparent, 8 bits, sRGB, `dpi` points par pouce, recadré à la boîte
 * englobante des calques + 5 mm. Fonction pure : aucun accès réseau ni disque (assets fournis).
 */
export async function renderZoneDetailed(
  zone: Zone,
  assets: RenderAssets,
  dpi: number = PRINT_DPI,
  zoneSize: PrintZoneSize = DEFAULT_PRINT_ZONES.front,
): Promise<RenderedZone> {
  if (zone.layers.length === 0) throw new RenderError('EMPTY_ZONE', 'Zone sans calque.');
  const ppm = dpi / MM_PER_INCH;
  const crop = cropBox(zone.layers, zoneSize);
  const originPx = { x: Math.round(crop.x * ppm), y: Math.round(crop.y * ppm) };
  const widthPx = Math.max(1, Math.round(crop.width * ppm));
  const heightPx = Math.max(1, Math.round(crop.height * ppm));

  const canvas = createCanvas(widthPx, heightPx);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const layer of zone.layers) {
    if (layer.type === 'pattern') {
      const data = assets.patterns[layer.patternId];
      if (!data) {
        throw new RenderError('PATTERN_ASSET_MISSING', `Motif ${layer.patternId} introuvable.`);
      }
      let img: Image;
      try {
        img = await loadImage(data);
      } catch {
        throw new RenderError('ASSET_INVALID', `Image du motif ${layer.patternId} illisible.`);
      }
      drawPattern(ctx, layer, img, ppm, originPx, dpi);
    } else {
      const data = assets.fonts[layer.fontId];
      if (!data) throw new RenderError('FONT_ASSET_MISSING', `Police ${layer.fontId} introuvable.`);
      drawText(ctx, layer, fontFamilyOf(data), ppm, originPx);
    }
  }

  const raw = canvas.toBuffer('image/png');
  const encoded = await sharp(raw, { limitInputPixels: false })
    .withIccProfile('srgb')
    .withMetadata({ density: dpi })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const note =
    `crop=${crop.x.toFixed(2)},${crop.y.toFixed(2)},${crop.width.toFixed(2)},${crop.height.toFixed(2)}mm;` +
    `zone=${zoneSize.widthMm}x${zoneSize.heightMm}mm;dpi=${dpi}`;
  return {
    png: embedTextChunk(encoded, 'StreetwearCrop', note),
    widthPx,
    heightPx,
    cropMm: crop,
  };
}

export async function renderZone(
  zone: Zone,
  assets: RenderAssets,
  dpi: number = PRINT_DPI,
  zoneSize: PrintZoneSize = DEFAULT_PRINT_ZONES.front,
): Promise<Buffer> {
  return (await renderZoneDetailed(zone, assets, dpi, zoneSize)).png;
}
