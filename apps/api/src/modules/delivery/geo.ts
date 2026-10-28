import { z } from 'zod';

/**
 * Point dans polygone en TypeScript pur (lancer de rayon, anneaux intérieurs = trous).
 * Choix : pas de PostGIS (non garanti chez l'hébergeur, quelques zones seulement).
 * Coordonnées GeoJSON : [longitude, latitude].
 */
const Position = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .rest(z.number());
const Ring = z
  .array(Position)
  .min(4)
  .refine((r) => {
    const a = r[0];
    const b = r[r.length - 1];
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
  }, 'Anneau non fermé.');
const PolygonCoords = z.array(Ring).min(1);

export const GeoPolygonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: PolygonCoords }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(PolygonCoords).min(1) }),
]);
export type GeoPolygon = z.infer<typeof GeoPolygonSchema>;

type RingT = z.infer<typeof Ring>;

function inRing(lng: number, lat: number, ring: RingT): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, rings: RingT[]): boolean {
  const [outer, ...holes] = rings;
  return !!outer && inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h));
}

export function polygonsOf(g: GeoPolygon): RingT[][] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function pointInGeo(lat: number, lng: number, g: GeoPolygon): boolean {
  return polygonsOf(g).some((p) => inPolygon(lng, lat, p));
}

/** Aire (formule du lacet, en degrés carrés) : sert à choisir la zone la plus précise. */
export function geoArea(g: GeoPolygon): number {
  const ringArea = (r: RingT): number => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i] as [number, number];
      const [xj, yj] = r[j] as [number, number];
      s += xj * yi - xi * yj;
    }
    return Math.abs(s) / 2;
  };
  return polygonsOf(g).reduce((acc, [outer, ...holes]) => {
    if (!outer) return acc;
    return acc + ringArea(outer) - holes.reduce((a, h) => a + ringArea(h), 0);
  }, 0);
}

/** Accepte un Feature, une FeatureCollection (première géométrie) ou une géométrie GeoJSON. */
export function extractGeometry(input: unknown): unknown {
  const o = input as { type?: string; geometry?: unknown; features?: { geometry?: unknown }[] };
  if (o?.type === 'Feature') return o.geometry;
  if (o?.type === 'FeatureCollection') return o.features?.[0]?.geometry;
  return input;
}
