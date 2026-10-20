import type { DesignSpec } from '../design-spec/schema';
import type { PriceRules } from '../pricing';
import type { OrderStatus } from '../order-state-machine';
import type {
  Address,
  DeliveryZoneSummary,
  Design,
  Font,
  Order,
  Pattern,
  PatternCategory,
  Size,
  Store,
  TshirtColor,
} from '../contracts';

export const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CDN = 'https://cdn.example.test';

export const FIXTURE_CATEGORIES: PatternCategory[] = [
  { id: uid(900), slug: 'pagne-traditionnel', name: 'Pagne traditionnel', position: 1 },
  { id: uid(901), slug: 'geometrique', name: 'Géométrique', position: 2 },
];

const pattern = (
  id: string,
  name: string,
  origin: string,
  categoryId: string,
  priceTier: 'standard' | 'premium',
  tags: string[],
): Pattern => ({
  id,
  name,
  origin,
  categoryId,
  tags,
  priceTier,
  thumbnailUrl: `${CDN}/patterns/${id}/thumb.png`,
  previewUrl: `${CDN}/patterns/${id}/preview.png`,
  widthPx: 4800,
  heightPx: 4800,
});

export const FIXTURE_PATTERNS: Pattern[] = [
  pattern('pat-kente-ewe', 'Kente éwé', 'Éwé, Togo/Ghana', uid(900), 'premium', ['kente', 'ewe']),
  pattern('pat-wax-be', 'Wax Bè', 'Lomé, Togo', uid(900), 'premium', ['wax', 'be']),
  pattern('pat-losanges', 'Losanges', 'Afrique de l’Ouest', uid(901), 'standard', ['losange']),
  pattern('pat-soleil', 'Soleil', 'Afrique de l’Ouest', uid(901), 'standard', ['soleil']),
  pattern('pat-bogolan', 'Bogolan', 'Mali', uid(900), 'standard', ['bogolan', 'boue']),
  pattern('pat-bandes', 'Bandes', 'Afrique de l’Ouest', uid(901), 'standard', ['bandes']),
];

export const FIXTURE_PATTERNS_BY_ID: Record<string, Pattern> = Object.fromEntries(
  FIXTURE_PATTERNS.map((p) => [p.id, p]),
);

export const FIXTURE_COLORS: TshirtColor[] = [
  { id: 'col-noir', name: 'Noir', hex: '#111111', isDark: true },
  { id: 'col-blanc', name: 'Blanc', hex: '#FFFFFF', isDark: false },
  { id: 'col-sable', name: 'Sable', hex: '#D9C3A0', isDark: false },
  { id: 'col-indigo', name: 'Indigo', hex: '#2B3A67', isDark: true },
  { id: 'col-terracotta', name: 'Terracotta', hex: '#B5543A', isDark: true },
];

export const FIXTURE_FONTS: Font[] = [
  { id: 'font-bebas', name: 'Bebas', family: 'Bebas Neue', fileUrl: `${CDN}/fonts/bebas.ttf` },
  { id: 'font-anton', name: 'Anton', family: 'Anton', fileUrl: `${CDN}/fonts/anton.ttf` },
  {
    id: 'font-marker',
    name: 'Marker',
    family: 'Permanent Marker',
    fileUrl: `${CDN}/fonts/marker.ttf`,
  },
];

export const FIXTURE_PRICE_RULES: PriceRules = {
  baseXof: 8500,
  patternStandardXof: 1500,
  patternPremiumXof: 2500,
  textXof: 1000,
};

export const FIXTURE_ZONES: DeliveryZoneSummary[] = [
  { id: uid(800), name: 'Lomé centre', feeXof: 1000, delayHours: 24 },
  { id: uid(801), name: 'Lomé périphérie (Adidogomé, Agoè)', feeXof: 1500, delayHours: 48 },
  { id: uid(802), name: 'Baguida / Aného route', feeXof: 2500, delayHours: 72 },
];

export const FIXTURE_STORE: Store = {
  id: uid(700),
  name: 'Boutique Streetwear Tokoin',
  address: 'Rue des Hibiscus, Tokoin, Lomé',
  lat: 6.1375,
  lng: 1.2123,
  openingHours: { 'lun-sam': '09:00-19:00', dim: 'fermé' },
};

const layerPattern = (n: number, patternId: string, over: Record<string, unknown> = {}) => ({
  type: 'pattern' as const,
  id: uid(n),
  patternId,
  x: 20,
  y: 40,
  width: 250,
  height: 250,
  rotation: 0,
  repeat: 'none' as const,
  tileScale: 1,
  ...over,
});
const layerText = (n: number, text: string, over: Record<string, unknown> = {}) => ({
  type: 'text' as const,
  id: uid(n),
  text,
  fontId: 'font-bebas',
  colorHex: '#FFFFFF',
  sizeMm: 20,
  x: 148.5,
  y: 330,
  rotation: 0,
  align: 'center' as const,
  ...over,
});

export const VALID_DESIGNS: Record<string, DesignSpec> = {
  patternOnly: {
    version: 1,
    colorId: 'col-noir',
    zones: { front: { layers: [layerPattern(1, 'pat-kente-ewe')] } },
  },
  patternAndText: {
    version: 1,
    colorId: 'col-sable',
    zones: {
      front: {
        layers: [
          layerPattern(2, 'pat-losanges', { rotation: 15, x: 40, width: 200, height: 200 }),
          layerText(3, 'LOMÉ 228'),
        ],
      },
    },
  },
  frontBackTiled: {
    version: 1,
    colorId: 'col-indigo',
    zones: {
      front: {
        layers: [
          layerPattern(4, 'pat-wax-be', {
            repeat: 'tile',
            tileScale: 0.5,
            x: 0,
            y: 0,
            width: 297,
            height: 420,
          }),
        ],
      },
      back: {
        layers: [
          layerPattern(5, 'pat-soleil', { rotation: 90, x: 48.5, y: 0, width: 200, height: 297 }),
        ],
      },
    },
  },
};

export type InvalidDesignFixture = {
  name: string;
  spec: unknown;
  expectedCode: string;
  expectedMessage: string;
};

export const INVALID_DESIGNS: InvalidDesignFixture[] = [
  {
    name: 'no layer at all',
    spec: { version: 1, colorId: 'col-noir', zones: {} },
    expectedCode: 'DESIGN_EMPTY',
    expectedMessage: 'au moins un calque',
  },
  {
    name: 'two patterns in the same zone',
    spec: {
      version: 1,
      colorId: 'col-noir',
      zones: {
        front: { layers: [layerPattern(10, 'pat-soleil'), layerPattern(11, 'pat-bandes')] },
      },
    },
    expectedCode: 'TOO_MANY_PATTERNS_IN_ZONE',
    expectedMessage: 'un seul motif',
  },
  {
    name: 'two text layers across zones',
    spec: {
      version: 1,
      colorId: 'col-noir',
      zones: {
        front: { layers: [layerText(12, 'AVANT')] },
        back: { layers: [layerText(13, 'ARRIERE')] },
      },
    },
    expectedCode: 'TOO_MANY_TEXT_LAYERS',
    expectedMessage: 'un seul texte',
  },
  {
    name: '280 mm square rotated 45 degrees leaves the zone',
    spec: {
      version: 1,
      colorId: 'col-noir',
      zones: {
        front: {
          layers: [
            layerPattern(14, 'pat-bogolan', {
              x: 8.5,
              y: 70,
              width: 280,
              height: 280,
              rotation: 45,
            }),
          ],
        },
      },
    },
    expectedCode: 'LAYER_OUT_OF_ZONE',
    expectedMessage: 'dépasse de la zone avant',
  },
  {
    name: 'text smaller than 8 mm',
    spec: {
      version: 1,
      colorId: 'col-noir',
      zones: { front: { layers: [layerText(15, 'PETIT', { sizeMm: 6 })] } },
    },
    expectedCode: 'INVALID_DESIGN_FORMAT',
    expectedMessage: 'au moins 8 mm',
  },
];

const designOf = (n: number, spec: DesignSpec, unitPriceXof: number): Design => ({
  id: uid(n),
  name: null,
  spec,
  isDraft: false,
  previewFrontUrl: null,
  previewBackUrl: null,
  unitPriceXof,
  updatedAt: '2026-11-20T10:00:00Z',
});

const homeAddress: Address = {
  id: uid(600),
  label: 'Maison',
  lat: 6.1725,
  lng: 1.2314,
  district: 'Bè',
  landmark: 'Près du marché de Bè',
  recipientPhone: '+22890123456',
  zone: FIXTURE_ZONES[0] ?? null,
};

const SIZES_CYCLE: Size[] = ['M', 'L', 'S', 'XL'];

const order = (
  n: number,
  status: OrderStatus,
  opts: {
    pickup?: boolean;
    cod?: boolean;
    qty?: number;
    specKey?: keyof typeof VALID_DESIGNS;
  } = {},
): Order => {
  const spec = VALID_DESIGNS[opts.specKey ?? 'patternOnly'] as DesignSpec;
  const unit =
    opts.specKey === 'patternAndText' ? 11500 : opts.specKey === 'frontBackTiled' ? 13500 : 11000;
  const qty = opts.qty ?? 1;
  const subtotalXof = unit * qty;
  const deliveryFeeXof = opts.pickup ? 0 : 1000;
  const totalXof = subtotalXof + deliveryFeeXof;
  const createdAt = `2026-11-${String(10 + n).padStart(2, '0')}T09:30:00Z`;
  return {
    id: uid(500 + n),
    number: `TG-${String(n).padStart(6, '0')}`,
    status,
    items: [
      {
        id: uid(550 + n),
        design: { spec, previewFrontUrl: null, previewBackUrl: null },
        colorId: spec.colorId,
        size: SIZES_CYCLE[n % SIZES_CYCLE.length] as Size,
        quantity: qty,
        unitPriceXof: unit,
        lineTotalXof: subtotalXof,
      },
    ],
    subtotalXof,
    deliveryFeeXof,
    totalXof,
    depositXof: opts.cod ? Math.ceil(totalXof / 200) * 100 : null,
    paymentMethod: opts.cod ? 'cod' : n % 2 ? 'tmoney' : 'flooz',
    reception: opts.pickup
      ? {
          type: 'pickup',
          store: FIXTURE_STORE,
          slot: {
            id: uid(650),
            startsAt: '2026-11-25T10:00:00Z',
            endsAt: '2026-11-25T10:30:00Z',
            remaining: 3,
          },
        }
      : { type: 'home', address: homeAddress },
    history: [{ status: 'pending_payment', at: createdAt }],
    expiresAt: status === 'pending_payment' ? '2026-11-20T10:00:00Z' : null,
    createdAt,
  };
};

export const FIXTURE_ORDERS: Order[] = [
  order(1, 'pending_payment'),
  order(2, 'payment_failed', { qty: 2 }),
  order(3, 'paid', { specKey: 'patternAndText' }),
  order(4, 'deposit_paid', { cod: true, qty: 3 }),
  order(5, 'in_production', { specKey: 'frontBackTiled' }),
  order(6, 'ready_for_pickup', { pickup: true }),
  order(7, 'shipped', { qty: 2 }),
  order(8, 'delivered', { specKey: 'patternAndText' }),
];

export const FIXTURE_DESIGNS: Design[] = [
  designOf(400, VALID_DESIGNS.patternOnly as DesignSpec, 11000),
  designOf(401, VALID_DESIGNS.patternAndText as DesignSpec, 11500),
  designOf(402, VALID_DESIGNS.frontBackTiled as DesignSpec, 13500),
];
