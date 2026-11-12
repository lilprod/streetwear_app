import type { GeoPolygon } from './logistics-api';

/** Emprise large du Togo (lng, lat) : refuse les fichiers dont les coordonnées sont inversées ou hors pays. */
export const TOGO_BOUNDS = { minLng: -0.2, maxLng: 1.9, minLat: 6.0, maxLat: 11.2 } as const;

export type GeoJsonError =
  'invalid_json' | 'no_geometry' | 'bad_type' | 'bad_ring' | 'bad_position' | 'out_of_togo';

export type GeoJsonResult = { ok: true; polygon: GeoPolygon } | { ok: false; error: GeoJsonError };

const isPosition = (p: unknown): p is number[] =>
  Array.isArray(p) && p.length >= 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

const geometryOf = (input: unknown): unknown => {
  const o = input as { type?: string; geometry?: unknown; features?: { geometry?: unknown }[] };
  if (o?.type === 'Feature') return o.geometry;
  if (o?.type === 'FeatureCollection') return o.features?.[0]?.geometry;
  return input;
};

function checkRings(rings: unknown): GeoJsonError | null {
  if (!Array.isArray(rings) || rings.length === 0) return 'bad_ring';
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) return 'bad_ring';
    if (!ring.every(isPosition)) return 'bad_position';
    const a = ring[0] as number[];
    const b = ring[ring.length - 1] as number[];
    if (a[0] !== b[0] || a[1] !== b[1]) return 'bad_ring';
    for (const p of ring as number[][]) {
      const [lng, lat] = p as [number, number];
      if (
        lng < TOGO_BOUNDS.minLng ||
        lng > TOGO_BOUNDS.maxLng ||
        lat < TOGO_BOUNDS.minLat ||
        lat > TOGO_BOUNDS.maxLat
      ) {
        return 'out_of_togo';
      }
    }
  }
  return null;
}

/** Valide un GeoJSON collé ou importé (Polygon, MultiPolygon, Feature ou FeatureCollection : première géométrie). */
export function parseGeoJson(text: string): GeoJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  const g = geometryOf(raw) as { type?: string; coordinates?: unknown } | undefined;
  if (!g || typeof g !== 'object') return { ok: false, error: 'no_geometry' };
  if (g.type === 'Polygon') {
    const err = checkRings(g.coordinates);
    return err
      ? { ok: false, error: err }
      : { ok: true, polygon: { type: 'Polygon', coordinates: g.coordinates as number[][][] } };
  }
  if (g.type === 'MultiPolygon') {
    if (!Array.isArray(g.coordinates) || g.coordinates.length === 0)
      return { ok: false, error: 'bad_ring' };
    for (const poly of g.coordinates) {
      const err = checkRings(poly);
      if (err) return { ok: false, error: err };
    }
    return {
      ok: true,
      polygon: { type: 'MultiPolygon', coordinates: g.coordinates as number[][][][] },
    };
  }
  return { ok: false, error: 'bad_type' };
}

/** Anneaux extérieurs et trous en [lat, lng] pour Leaflet. */
export function toLeafletRings(p: GeoPolygon): [number, number][][][] {
  const polys = p.type === 'Polygon' ? [p.coordinates] : p.coordinates;
  return polys.map((rings) =>
    rings.map((ring) => ring.map((pos) => [pos[1] as number, pos[0] as number])),
  );
}
