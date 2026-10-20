import sanitizeHtml from 'sanitize-html';

const SHAPE_ATTRS = [
  'id',
  'class',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'clip-path',
  'mask',
  'clip-rule',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  svg: ['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio', 'version', ...SHAPE_ATTRS],
  g: SHAPE_ATTRS,
  path: ['d', ...SHAPE_ATTRS],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', ...SHAPE_ATTRS],
  circle: ['cx', 'cy', 'r', ...SHAPE_ATTRS],
  ellipse: ['cx', 'cy', 'rx', 'ry', ...SHAPE_ATTRS],
  line: ['x1', 'y1', 'x2', 'y2', ...SHAPE_ATTRS],
  polygon: ['points', ...SHAPE_ATTRS],
  polyline: ['points', ...SHAPE_ATTRS],
  defs: ['id'],
  clipPath: ['id', 'clipPathUnits'],
  mask: ['id', 'x', 'y', 'width', 'height', 'maskUnits'],
  pattern: ['id', 'x', 'y', 'width', 'height', 'patternUnits', 'patternTransform', 'viewBox'],
  linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform'],
  radialGradient: ['id', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  use: ['href', 'x', 'y', 'width', 'height', ...SHAPE_ATTRS],
};

const UNSAFE_VALUE = /javascript:|data:|url\(\s*(?!#)|expression\(|@import/i;

/** Retire scripts, styles, gestionnaires d'événements et toute référence externe d'un SVG. */
export function sanitizeSvg(source: string): string {
  const out = sanitizeHtml(source, {
    allowedTags: Object.keys(ALLOWED_ATTRIBUTES),
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: [],
    allowProtocolRelative: false,
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    transformTags: {
      '*': (tagName, attribs) => {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(attribs)) {
          if (UNSAFE_VALUE.test(v)) continue;
          if (k === 'href' && !v.startsWith('#')) continue;
          clean[k] = v;
        }
        return { tagName, attribs: clean };
      },
    },
  });
  return out;
}

export function isSvgDocument(source: string): boolean {
  return /<svg[\s>]/i.test(source);
}
