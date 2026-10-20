import { z } from 'zod';
import { TEXT_MAX_LENGTH, TEXT_MAX_SIZE_MM, TEXT_MIN_SIZE_MM } from './zones';

const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const INVISIBLE_JOINERS = ['\u200d', '\ufe0f', '\u20e3'];
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

const mm = (label: string) =>
  z
    .number({ invalid_type_error: `${label} doit être un nombre.` })
    .finite(`${label} doit être fini.`);
const rotation = z
  .number({ invalid_type_error: 'La rotation doit être un nombre.' })
  .min(-180, 'La rotation doit être comprise entre -180 et 180 degrés.')
  .max(180, 'La rotation doit être comprise entre -180 et 180 degrés.');
const layerId = z.string().uuid("L'identifiant du calque doit être un UUID.");

export const PatternLayerSchema = z
  .object({
    type: z.literal('pattern'),
    id: layerId,
    patternId: z.string().min(1, 'Le motif est obligatoire.'),
    x: mm('x'),
    y: mm('y'),
    width: mm('La largeur').positive('La largeur doit être positive.'),
    height: mm('La hauteur').positive('La hauteur doit être positive.'),
    rotation,
    repeat: z.enum(['none', 'tile'], { message: 'Le mode de répétition est invalide.' }),
    tileScale: z
      .number()
      .min(0.25, "L'échelle de répétition doit être comprise entre 0,25 et 4.")
      .max(4, "L'échelle de répétition doit être comprise entre 0,25 et 4."),
  })
  .strict();
export type PatternLayer = z.infer<typeof PatternLayerSchema>;

export const TextLayerSchema = z
  .object({
    type: z.literal('text'),
    id: layerId,
    text: z
      .string()
      .refine((t) => t.trim().length > 0, 'Le texte ne peut pas être vide.')
      .refine(
        (t) => [...t].length <= TEXT_MAX_LENGTH,
        `Le texte ne doit pas dépasser ${TEXT_MAX_LENGTH} caractères.`,
      )
      .refine(
        (t) => !EMOJI_RE.test(t) && !INVISIBLE_JOINERS.some((c) => t.includes(c)),
        'Les emoji ne sont pas autorisés dans le texte.',
      )
      .refine((t) => !CONTROL_RE.test(t), 'Le texte contient des caractères interdits.'),
    fontId: z.string().min(1, 'La police est obligatoire.'),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'La couleur doit être au format #RRGGBB.'),
    sizeMm: z
      .number()
      .min(TEXT_MIN_SIZE_MM, `La taille du texte doit être d'au moins ${TEXT_MIN_SIZE_MM} mm.`)
      .max(TEXT_MAX_SIZE_MM, `La taille du texte ne doit pas dépasser ${TEXT_MAX_SIZE_MM} mm.`),
    x: mm('x'),
    y: mm('y'),
    rotation,
    align: z.literal('center'),
  })
  .strict();
export type TextLayer = z.infer<typeof TextLayerSchema>;

export const LayerSchema = z.discriminatedUnion('type', [PatternLayerSchema, TextLayerSchema]);
export type Layer = z.infer<typeof LayerSchema>;

export const ZoneSchema = z
  .object({
    layers: z
      .array(LayerSchema)
      .min(1, 'Une zone ne peut pas être vide.')
      .max(10, 'Une zone ne peut pas contenir plus de 10 calques.'),
  })
  .strict();
export type Zone = z.infer<typeof ZoneSchema>;

/** Code stable des règles métier zone-indépendantes (portées par `params.code` des issues Zod). */
export const DESIGN_RULE_CODES = {
  empty: 'DESIGN_EMPTY',
  tooManyPatterns: 'TOO_MANY_PATTERNS_IN_ZONE',
  tooManyTexts: 'TOO_MANY_TEXT_LAYERS',
  duplicateLayerId: 'DUPLICATE_LAYER_ID',
} as const;

export const DesignSpecV1Schema = z
  .object({
    version: z.literal(1, { errorMap: () => ({ message: 'La version du design doit être 1.' }) }),
    colorId: z.string().min(1, 'La couleur du t-shirt est obligatoire.'),
    zones: z.object({ front: ZoneSchema.optional(), back: ZoneSchema.optional() }).strict(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const entries = Object.entries(spec.zones) as [string, Zone | undefined][];
    const filled = entries.filter(([, z]) => z && z.layers.length > 0);
    if (filled.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['zones'],
        message: 'Le design doit contenir au moins un calque dans au moins une zone.',
        params: { code: DESIGN_RULE_CODES.empty },
      });
    }
    let texts = 0;
    const ids = new Set<string>();
    for (const [name, zone] of entries) {
      if (!zone) continue;
      const patterns = zone.layers.filter((l) => l.type === 'pattern').length;
      if (patterns > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['zones', name, 'layers'],
          message: `Une zone ne peut contenir qu'un seul motif (${patterns} trouvés).`,
          params: { code: DESIGN_RULE_CODES.tooManyPatterns },
        });
      }
      zone.layers.forEach((layer, i) => {
        if (layer.type === 'text') {
          texts += 1;
          if (texts === 2) {
            ctx.addIssue({
              code: 'custom',
              path: ['zones', name, 'layers', i],
              message: "Le design ne peut contenir qu'un seul texte.",
              params: { code: DESIGN_RULE_CODES.tooManyTexts },
            });
          }
        }
        if (ids.has(layer.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['zones', name, 'layers', i, 'id'],
            message: 'Deux calques ont le même identifiant.',
            params: { code: DESIGN_RULE_CODES.duplicateLayerId },
          });
        }
        ids.add(layer.id);
      });
    }
  });
export type DesignSpecV1 = z.infer<typeof DesignSpecV1Schema>;

export const DesignSpecSchema = DesignSpecV1Schema;
export type DesignSpec = DesignSpecV1;
