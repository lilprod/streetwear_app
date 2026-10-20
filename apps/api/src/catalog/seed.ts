import type { PrismaClient } from '@prisma/client';
import {
  FIXTURE_CATEGORIES,
  FIXTURE_COLORS,
  FIXTURE_FONTS,
  FIXTURE_PATTERNS,
  FIXTURE_PRICE_RULES,
} from '@streetwear/shared';

/** Liste de départ, à compléter et valider par la marque (termes éwé notamment). */
export const INITIAL_BANNED_WORDS = [
  'merde',
  'putain',
  'salope',
  'connard',
  'connasse',
  'enculer',
  'encule',
  'foutre',
  'batard',
  'pedophile',
  'violeur',
  'nazi',
  'hitler',
  'terroriste',
  'kkk',
  'sale negre',
  'sale blanc',
  'enfoire',
  'bougnoule',
  'trou du cul',
];

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  for (const c of FIXTURE_CATEGORIES) {
    await prisma.patternCategory.upsert({
      where: { id: c.id },
      create: { id: c.id, slug: c.slug, name: c.name, position: c.position },
      update: { slug: c.slug, name: c.name, position: c.position },
    });
  }
  for (const p of FIXTURE_PATTERNS) {
    const data = {
      categoryId: p.categoryId,
      name: p.name,
      origin: p.origin,
      tags: p.tags,
      priceTier: p.priceTier,
      imagePublicId: `patterns/${p.id}`,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      rightsHolder: 'Atelier Streetwear (motif de démonstration)',
      active: true,
    };
    await prisma.pattern.upsert({
      where: { id: p.id },
      create: { id: p.id, ...data },
      update: data,
    });
  }
  let position = 0;
  for (const c of FIXTURE_COLORS) {
    const data = { name: c.name, hex: c.hex, isDark: c.isDark, active: true, position: position++ };
    await prisma.tshirtColor.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }
  for (const f of FIXTURE_FONTS) {
    const data = {
      name: f.name,
      family: f.family,
      filePublicId: `fonts/${f.id.replace('font-', '')}`,
      licenseRef: 'SIL OFL 1.1',
      active: true,
    };
    await prisma.font.upsert({ where: { id: f.id }, create: { id: f.id, ...data }, update: data });
  }
  const rules = {
    base: FIXTURE_PRICE_RULES.baseXof,
    pattern_standard: FIXTURE_PRICE_RULES.patternStandardXof,
    pattern_premium: FIXTURE_PRICE_RULES.patternPremiumXof,
    text: FIXTURE_PRICE_RULES.textXof,
  };
  for (const [key, amountXof] of Object.entries(rules)) {
    await prisma.priceRule.upsert({
      where: { key },
      create: { key, amountXof },
      update: { amountXof },
    });
  }
  await prisma.bannedWord.createMany({
    data: INITIAL_BANNED_WORDS.map((word) => ({ word })),
    skipDuplicates: true,
  });
}
