import { Injectable } from '@nestjs/common';
import type { PriceRules } from '@streetwear/shared';
import { PrismaService } from '../prisma/prisma.service';

export const PRICE_RULE_KEYS = {
  baseXof: 'base',
  patternStandardXof: 'pattern_standard',
  patternPremiumXof: 'pattern_premium',
  textXof: 'text',
} as const;

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async current(): Promise<PriceRules> {
    const rows = await this.prisma.priceRule.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.amountXof]));
    const rules = {} as Record<keyof PriceRules, number>;
    for (const [field, key] of Object.entries(PRICE_RULE_KEYS)) {
      const amount = byKey.get(key);
      if (amount === undefined) throw new Error(`Règle de prix manquante : ${key}`);
      rules[field as keyof PriceRules] = amount;
    }
    return rules;
  }
}
