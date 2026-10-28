import { z } from 'zod';
import { apiError } from '../../common/api-error';
import { GeoPolygonSchema, extractGeometry } from './geo';
import { OPENING_KEY_RE, OPENING_VALUE_RE } from './slots.service';

const polygon = z.preprocess(extractGeometry, GeoPolygonSchema);
const xof = z.number().int().min(0).max(1_000_000);

export const ZoneInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    polygon,
    feeXof: xof,
    delayHours: z.number().int().min(0).max(720),
    active: z.boolean().optional(),
  })
  .strict();
export const ZonePatchSchema = ZoneInputSchema.partial();

const openingHours = z
  .record(z.string())
  .refine(
    (o) => Object.entries(o).every(([k, v]) => OPENING_KEY_RE.test(k) && OPENING_VALUE_RE.test(v)),
    'Horaires attendus : { "lun-sam": "09:00-19:00", "dim": "fermé" }.',
  );

export const StoreInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(250),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    openingHours,
    defaultSlotCapacity: z.number().int().min(1).max(100).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export const StorePatchSchema = StoreInputSchema.partial();

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
export const AdminSlotsQuerySchema = z.object({ date: date.optional() });
export const GenerateSlotsInputSchema = z
  .object({
    days: z.number().int().min(1).max(30).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const SlotPatchSchema = z.object({ capacity: z.number().int().min(1).max(100) }).strict();

export const AdminDeliveriesQuerySchema = z.object({
  status: z.enum(['to_assign', 'assigned', 'in_progress', 'delivered', 'failed']).optional(),
  date: date.optional(),
});

export const dayRange = (d: string): { gte: Date; lt: Date } => {
  const gte = new Date(`${d}T00:00:00.000Z`);
  if (Number.isNaN(gte.getTime()) || gte.toISOString().slice(0, 10) !== d) {
    throw apiError(400, 'VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
      fieldErrors: { date: ['Date inexistante.'] },
    });
  }
  return { gte, lt: new Date(gte.getTime() + 86_400_000) };
};
