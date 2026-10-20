import {
  DEFAULT_PRINT_ZONES,
  TEXT_BOX_HEIGHT_FACTOR,
  TEXT_CHAR_WIDTH_FACTOR,
  TEXT_MAX_LENGTH,
  TEXT_MAX_SIZE_MM,
  TEXT_MIN_SIZE_MM,
  validateDesignSpec,
  type DesignSpec,
  type Layer,
  type Pattern,
  type PatternLayer,
  type TextLayer,
  type TshirtColor,
  type ZoneName,
} from '@streetwear/shared';
import {
  applyTransform,
  type Geo,
  type ScaleLimits,
  type Transform,
  type ZoneDims,
} from './gestureMath';

export type Side = ZoneName;
export type Content = { colorId: string; front: Layer[]; back: Layer[] };

export const PATTERN_DEFAULT_MM = 200;
export const PATTERN_MIN_MM = 20;
export const MOVE_STEP_MM = 5;
export const ROTATE_STEP_DEG = 15;
export const SCALE_STEP = 1.1;
export const GOLD_HEX = '#D4AF37';
export const RED_HEX = '#C8102E';
export const DEFAULT_TEXT_SIZE_MM = 20;
export const DEFAULT_TEXT_Y_MM = 330;

export const zoneDims = (side: Side): ZoneDims => ({
  w: DEFAULT_PRINT_ZONES[side].widthMm,
  h: DEFAULT_PRINT_ZONES[side].heightMm,
});

export function newLayerId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

export const emptyContent = (colorId: string): Content => ({ colorId, front: [], back: [] });

export function contentFromSpec(spec: DesignSpec): Content {
  return {
    colorId: spec.colorId,
    front: spec.zones.front?.layers ?? [],
    back: spec.zones.back?.layers ?? [],
  };
}

export function contentToSpec(content: Content): DesignSpec | null {
  if (content.front.length === 0 && content.back.length === 0) return null;
  const zones: DesignSpec['zones'] = {};
  if (content.front.length > 0) zones.front = { layers: content.front };
  if (content.back.length > 0) zones.back = { layers: content.back };
  const result = validateDesignSpec({ version: 1, colorId: content.colorId, zones });
  return result.ok ? result.spec : null;
}

export const autoTextColor = (color: Pick<TshirtColor, 'isDark'>): string =>
  color.isDark ? '#FFFFFF' : '#111111';

export const textColorOptions = (color: Pick<TshirtColor, 'isDark'>): string[] => [
  autoTextColor(color),
  GOLD_HEX,
  RED_HEX,
];

export function geoOfLayer(layer: Layer): Geo {
  if (layer.type === 'pattern') {
    return {
      cx: layer.x + layer.width / 2,
      cy: layer.y + layer.height / 2,
      w: layer.width,
      h: layer.height,
      rot: layer.rotation,
    };
  }
  return {
    cx: layer.x,
    cy: layer.y,
    w: [...layer.text].length * layer.sizeMm * TEXT_CHAR_WIDTH_FACTOR,
    h: layer.sizeMm * TEXT_BOX_HEIGHT_FACTOR,
    rot: layer.rotation,
  };
}

export function layerWithGeo<L extends Layer>(layer: L, g: Geo): L {
  if (layer.type === 'pattern') {
    return {
      ...layer,
      x: g.cx - g.w / 2,
      y: g.cy - g.h / 2,
      width: g.w,
      height: g.h,
      rotation: g.rot,
    };
  }
  return { ...layer, x: g.cx, y: g.cy, sizeMm: g.h / TEXT_BOX_HEIGHT_FACTOR, rotation: g.rot };
}

export function scaleLimits(layer: Layer): ScaleLimits {
  if (layer.type === 'pattern') {
    return { minScale: PATTERN_MIN_MM / Math.min(layer.width, layer.height), maxScale: Infinity };
  }
  return {
    minScale: TEXT_MIN_SIZE_MM / layer.sizeMm,
    maxScale: TEXT_MAX_SIZE_MM / layer.sizeMm,
  };
}

export function transformLayer<L extends Layer>(layer: L, side: Side, t: Transform): L {
  return layerWithGeo(
    layer,
    applyTransform(geoOfLayer(layer), t, scaleLimits(layer), zoneDims(side)),
  );
}

const IDENTITY: Transform = { dx: 0, dy: 0, scale: 1, dRot: 0 };
const fit = <L extends Layer>(layer: L, side: Side): L => transformLayer(layer, side, IDENTITY);

export const layersOf = (c: Content, side: Side): Layer[] => (side === 'front' ? c.front : c.back);
const withLayers = (c: Content, side: Side, layers: Layer[]): Content =>
  side === 'front' ? { ...c, front: layers } : { ...c, back: layers };

export const findLayer = (c: Content, id: string | null): Layer | null =>
  id ? ([...c.front, ...c.back].find((l) => l.id === id) ?? null) : null;

export const sideOfLayer = (c: Content, id: string): Side | null =>
  c.front.some((l) => l.id === id) ? 'front' : c.back.some((l) => l.id === id) ? 'back' : null;

export const textLayerOf = (c: Content): TextLayer | null =>
  ([...c.front, ...c.back].find((l) => l.type === 'text') as TextLayer | undefined) ?? null;

export const patternLayerOf = (c: Content, side: Side): PatternLayer | null =>
  (layersOf(c, side).find((l) => l.type === 'pattern') as PatternLayer | undefined) ?? null;

export function removeLayer(c: Content, id: string): Content {
  return {
    ...c,
    front: c.front.filter((l) => l.id !== id),
    back: c.back.filter((l) => l.id !== id),
  };
}

export function setPattern(
  c: Content,
  side: Side,
  pattern: Pick<Pattern, 'id'>,
  makeId: () => string = newLayerId,
): { content: Content; layerId: string } {
  const layers = layersOf(c, side);
  const existing = patternLayerOf(c, side);
  if (existing) {
    return {
      content: withLayers(
        c,
        side,
        layers.map((l) => (l.id === existing.id ? { ...existing, patternId: pattern.id } : l)),
      ),
      layerId: existing.id,
    };
  }
  const zone = zoneDims(side);
  const size = Math.min(PATTERN_DEFAULT_MM, zone.w);
  const layer: PatternLayer = {
    type: 'pattern',
    id: makeId(),
    patternId: pattern.id,
    x: (zone.w - size) / 2,
    y: (zone.h - size) / 2 - 20,
    width: size,
    height: size,
    rotation: 0,
    repeat: 'none',
    tileScale: 1,
  };
  return { content: withLayers(c, side, [layer, ...layers]), layerId: layer.id };
}

export function updatePattern(
  c: Content,
  side: Side,
  patch: Partial<Pick<PatternLayer, 'repeat' | 'tileScale'>>,
): Content {
  const p = patternLayerOf(c, side);
  if (!p) return c;
  const tileScale =
    patch.tileScale === undefined ? p.tileScale : Math.min(4, Math.max(0.25, patch.tileScale));
  return withLayers(
    c,
    side,
    layersOf(c, side).map((l) => (l.id === p.id ? { ...p, ...patch, tileScale } : l)),
  );
}

export type TextPatch = Partial<Pick<TextLayer, 'text' | 'fontId' | 'colorHex' | 'sizeMm'>>;

export function setText(
  c: Content,
  side: Side,
  patch: TextPatch,
  defaults: { fontId: string; colorHex: string },
  makeId: () => string = newLayerId,
): { content: Content; layerId: string | null } | null {
  const existing = textLayerOf(c);
  const clean =
    patch.text === undefined ? undefined : [...patch.text].slice(0, TEXT_MAX_LENGTH).join('');
  if (existing) {
    const at = sideOfLayer(c, existing.id) ?? side;
    if (clean !== undefined && clean.trim().length === 0) {
      return { content: removeLayer(c, existing.id), layerId: null };
    }
    const size =
      patch.sizeMm === undefined
        ? existing.sizeMm
        : Math.min(TEXT_MAX_SIZE_MM, Math.max(TEXT_MIN_SIZE_MM, patch.sizeMm));
    const next = fit({ ...existing, ...patch, text: clean ?? existing.text, sizeMm: size }, at);
    return {
      content: withLayers(
        c,
        at,
        layersOf(c, at).map((l) => (l.id === existing.id ? next : l)),
      ),
      layerId: existing.id,
    };
  }
  if (clean === undefined || clean.trim().length === 0) return null;
  const zone = zoneDims(side);
  const layer = fit<TextLayer>(
    {
      type: 'text',
      id: makeId(),
      text: clean,
      fontId: patch.fontId ?? defaults.fontId,
      colorHex: patch.colorHex ?? defaults.colorHex,
      sizeMm: patch.sizeMm ?? DEFAULT_TEXT_SIZE_MM,
      x: zone.w / 2,
      y: DEFAULT_TEXT_Y_MM,
      rotation: 0,
      align: 'center',
    },
    side,
  );
  return { content: withLayers(c, side, [...layersOf(c, side), layer]), layerId: layer.id };
}

export function mapLayer(c: Content, id: string, fn: (l: Layer, side: Side) => Layer): Content {
  const side = sideOfLayer(c, id);
  if (!side) return c;
  return withLayers(
    c,
    side,
    layersOf(c, side).map((l) => (l.id === id ? fn(l, side) : l)),
  );
}

export function setColor(
  c: Content,
  color: TshirtColor,
  previous: TshirtColor | undefined,
): Content {
  const prevAuto = previous ? autoTextColor(previous) : null;
  const recolor = (l: Layer): Layer =>
    l.type === 'text' && prevAuto && l.colorHex === prevAuto
      ? { ...l, colorHex: autoTextColor(color) }
      : l;
  return { colorId: color.id, front: c.front.map(recolor), back: c.back.map(recolor) };
}
