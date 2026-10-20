import { z } from 'zod';
import type { DesignSpec } from '../design-spec/schema';

export const PriceRulesSchema = z
  .object({
    baseXof: z.number().int().nonnegative(),
    patternStandardXof: z.number().int().nonnegative(),
    patternPremiumXof: z.number().int().nonnegative(),
    textXof: z.number().int().nonnegative(),
  })
  .strict();
export type PriceRules = z.infer<typeof PriceRulesSchema>;

export type PriceTier = 'standard' | 'premium';
export type PatternPriceInfo = { priceTier: PriceTier };

export const CART_LINE_MIN_QUANTITY = 1;
export const CART_LINE_MAX_QUANTITY = 50;

function assertXof(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} doit être un entier XOF positif ou nul.`);
  }
}

/** base + motifs (standard/premium) + texte (une seule fois). Prix TTC, entier XOF. */
export function computeUnitPriceXof(
  spec: DesignSpec,
  rules: PriceRules,
  patternsById: Readonly<Record<string, PatternPriceInfo>> | ReadonlyMap<string, PatternPriceInfo>,
): number {
  const r = PriceRulesSchema.parse(rules);
  const lookup = (id: string) =>
    patternsById instanceof Map
      ? patternsById.get(id)
      : Object.prototype.hasOwnProperty.call(patternsById, id)
        ? (patternsById as Record<string, PatternPriceInfo>)[id]
        : undefined;
  let total = r.baseXof;
  let hasText = false;
  for (const zone of [spec.zones.front, spec.zones.back]) {
    for (const layer of zone?.layers ?? []) {
      if (layer.type === 'text') {
        hasText = true;
        continue;
      }
      const pattern = lookup(layer.patternId);
      if (!pattern) throw new Error(`Motif inconnu : ${layer.patternId}.`);
      total += pattern.priceTier === 'premium' ? r.patternPremiumXof : r.patternStandardXof;
    }
  }
  return hasText ? total + r.textXof : total;
}

/** TVA incluse = round(total x 18 / 118). */
export function computeVatIncludedXof(totalXof: number): number {
  assertXof(totalXof, 'Le total');
  return Math.round((totalXof * 18) / 118);
}

/** Acompte = ceil(total x pourcentage / 100), arrondi à la centaine supérieure, plafonné au total. */
export function computeDepositXof(totalXof: number, percent: number): number {
  assertXof(totalXof, 'Le total');
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new RangeError("Le pourcentage d'acompte doit être un entier entre 1 et 100.");
  }
  const rounded = Math.ceil((totalXof * percent) / 10000) * 100;
  return Math.min(rounded, totalXof);
}

export type CartLine = { unitPriceXof: number; quantity: number };
export type CartTotals = {
  subtotalXof: number;
  deliveryFeeXof: number;
  totalXof: number;
  vatIncludedXof: number;
  itemCount: number;
};

/** Frais de livraison ajoutés une seule fois ; aucun frais pour un panier vide. */
export function computeCartTotals(lines: readonly CartLine[], deliveryFeeXof: number): CartTotals {
  assertXof(deliveryFeeXof, 'Les frais de livraison');
  let subtotalXof = 0;
  let itemCount = 0;
  for (const line of lines) {
    assertXof(line.unitPriceXof, 'Le prix unitaire');
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < CART_LINE_MIN_QUANTITY ||
      line.quantity > CART_LINE_MAX_QUANTITY
    ) {
      throw new RangeError(
        `La quantité doit être un entier entre ${CART_LINE_MIN_QUANTITY} et ${CART_LINE_MAX_QUANTITY}.`,
      );
    }
    subtotalXof += line.unitPriceXof * line.quantity;
    itemCount += line.quantity;
  }
  const fee = lines.length === 0 ? 0 : deliveryFeeXof;
  const totalXof = subtotalXof + fee;
  return {
    subtotalXof,
    deliveryFeeXof: fee,
    totalXof,
    vatIncludedXof: computeVatIncludedXof(totalXof),
    itemCount,
  };
}
