import type { ZodIssue } from 'zod';
import { layerBoundingBox } from './geometry';
import { DesignSpecV1Schema, type DesignSpec } from './schema';
import { BOUNDS_EPSILON_MM, DEFAULT_PRINT_ZONES, ZONE_NAMES, type PrintZones } from './zones';

export type DesignIssue = { code: string; path: (string | number)[]; message: string };
export type DesignValidationResult =
  { ok: true; spec: DesignSpec } | { ok: false; errors: DesignIssue[] };

function toIssue(issue: ZodIssue): DesignIssue {
  const params = (issue as { params?: { code?: string } }).params;
  return {
    code: params?.code ?? 'INVALID_DESIGN_FORMAT',
    path: issue.path,
    message: issue.message,
  };
}

/** Règles 1, 2, 3 et 6 de docs/spec-design.md. Les règles 4 et 5 sont vérifiées par l'API. */
export function validateDesignSpec(
  input: unknown,
  zones: PrintZones = DEFAULT_PRINT_ZONES,
): DesignValidationResult {
  const parsed = DesignSpecV1Schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(toIssue) };
  const spec = parsed.data;
  const errors: DesignIssue[] = [];
  for (const name of ZONE_NAMES) {
    const zone = spec.zones[name];
    if (!zone) continue;
    const size = zones[name];
    zone.layers.forEach((layer, i) => {
      const path = ['zones', name, 'layers', i];
      const b = layerBoundingBox(layer);
      const out =
        b.x < -BOUNDS_EPSILON_MM ||
        b.y < -BOUNDS_EPSILON_MM ||
        b.x + b.width > size.widthMm + BOUNDS_EPSILON_MM ||
        b.y + b.height > size.heightMm + BOUNDS_EPSILON_MM;
      if (out) {
        errors.push({
          code: 'LAYER_OUT_OF_ZONE',
          path,
          message: `Le calque dépasse de la zone ${name === 'front' ? 'avant' : 'arrière'} (${size.widthMm} × ${size.heightMm} mm) : boîte englobante ${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm.`,
        });
      }
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}
