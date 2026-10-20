import { z } from 'zod';

export const ZONE_NAMES = ['front', 'back'] as const;
export type ZoneName = (typeof ZONE_NAMES)[number];

export const PrintZoneSizeSchema = z
  .object({ widthMm: z.number().positive().finite(), heightMm: z.number().positive().finite() })
  .strict();
export type PrintZoneSize = z.infer<typeof PrintZoneSizeSchema>;

export const PrintZonesSchema = z
  .object({ front: PrintZoneSizeSchema, back: PrintZoneSizeSchema })
  .strict();
export type PrintZones = z.infer<typeof PrintZonesSchema>;

/** Cadre A3 : 297 x 420 mm. Surchargeable via `settings.print_zones`. */
export const DEFAULT_PRINT_ZONES: PrintZones = {
  front: { widthMm: 297, heightMm: 420 },
  back: { widthMm: 297, heightMm: 420 },
};

export const TEXT_MIN_SIZE_MM = 8;
export const TEXT_MAX_SIZE_MM = 80;
export const TEXT_MAX_LENGTH = 14;
/** Largeur estimée d'un caractère = facteur x sizeMm (majoration volontaire, sans métriques de police). */
export const TEXT_CHAR_WIDTH_FACTOR = 1;
/** Hauteur de la boîte d'un texte = facteur x sizeMm (capitale + jambages). */
export const TEXT_BOX_HEIGHT_FACTOR = 1.4;
/** Tolérance numérique (mm) pour le test d'inclusion dans la zone. */
export const BOUNDS_EPSILON_MM = 1e-6;
