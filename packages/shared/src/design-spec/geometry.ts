import { TEXT_BOX_HEIGHT_FACTOR, TEXT_CHAR_WIDTH_FACTOR } from './zones';
import type { Layer } from './schema';

export type BoundingBox = { x: number; y: number; width: number; height: number };

/**
 * Boîte englobante alignée sur les axes (mm, relative à la zone) d'un calque après rotation
 * autour de son centre. Motif : (x, y) = coin haut-gauche. Texte : (x, y) = centre, boîte estimée.
 */
export function layerBoundingBox(layer: Layer): BoundingBox {
  let cx: number;
  let cy: number;
  let w: number;
  let h: number;
  if (layer.type === 'pattern') {
    w = layer.width;
    h = layer.height;
    cx = layer.x + w / 2;
    cy = layer.y + h / 2;
  } else {
    w = [...layer.text].length * layer.sizeMm * TEXT_CHAR_WIDTH_FACTOR;
    h = layer.sizeMm * TEXT_BOX_HEIGHT_FACTOR;
    cx = layer.x;
    cy = layer.y;
  }
  const rad = (layer.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = w * cos + h * sin;
  const bh = w * sin + h * cos;
  return { x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh };
}
