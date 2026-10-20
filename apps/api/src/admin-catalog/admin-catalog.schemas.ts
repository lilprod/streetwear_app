import { PriceRulesSchema } from '@streetwear/shared';
import { z } from 'zod';
import { FONT_FORMATS, MAX_UPLOAD_BYTES, PATTERN_FORMATS } from '../media/media-provider';

const name = z.string().trim().min(1).max(100);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur au format #RRGGBB attendue.');

export const CategoryInputSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug en minuscules, chiffres et tirets.')
      .max(60),
    name,
    position: z.number().int().min(0).default(0),
  })
  .strict();
export const CategoryPatchSchema = CategoryInputSchema.partial().strict();

const patternBase = z.object({
  categoryId: z.string().min(1),
  name,
  origin: z.string().trim().max(200).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  priceTier: z.enum(['standard', 'premium']),
  imagePublicId: z.string().min(1).max(200),
  imageFormat: z.enum(PATTERN_FORMATS, {
    message: 'Format d’image refusé : PNG, JPG ou SVG uniquement.',
  }),
  imageBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, 'Image trop volumineuse (20 Mo maximum).'),
  svgSource: z.string().max(MAX_UPLOAD_BYTES).optional(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  rightsHolder: z.string().trim().max(200).nullable().optional(),
  rightsProofUrl: z.string().url().nullable().optional(),
  active: z.boolean().default(false),
});

export const PatternInputSchema = patternBase.strict();
export const PatternPatchSchema = patternBase
  .partial()
  .strict()
  .refine(
    (v) =>
      v.imagePublicId === undefined || (v.imageFormat !== undefined && v.imageBytes !== undefined),
    { message: 'imageFormat et imageBytes sont requis avec imagePublicId.' },
  );
export const PatternsAdminQuerySchema = z.object({
  q: z.string().max(100).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const colorBase = z.object({
  name,
  hex,
  isDark: z.boolean(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});
export const ColorInputSchema = colorBase.strict();
export const ColorPatchSchema = colorBase.partial().strict();

const fontBase = z.object({
  name,
  family: name,
  filePublicId: z.string().min(1).max(200),
  fileFormat: z.enum(FONT_FORMATS, { message: 'Format de police refusé.' }),
  fileBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Fichier trop volumineux (20 Mo).'),
  licenseRef: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().default(true),
});
export const FontInputSchema = fontBase.strict();
export const FontPatchSchema = fontBase.partial().strict();

export const PriceRulesInputSchema = PriceRulesSchema;
export const PriceRulesPatchSchema = PriceRulesSchema.partial().strict();

export const BannedWordInputSchema = z
  .object({ word: z.string().trim().min(3, 'Au moins 3 caractères.').max(60) })
  .strict();

export const UploadSignatureInputSchema = z.object({ kind: z.enum(['pattern', 'font']) }).strict();
