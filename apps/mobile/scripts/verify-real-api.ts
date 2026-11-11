/**
 * Vérifie le vrai client API du mobile (src/api/http.ts) contre une API locale.
 * Usage : apps/api/node_modules/.bin/tsx apps/mobile/scripts/verify-real-api.ts
 * Variables : VERIFY_API_URL (défaut http://localhost:3010/v1), VERIFY_API_ENV (défaut apps/api/.env).
 * Le code OTP n'est jamais journalisé par l'API : il est retrouvé en recalculant le HMAC stocké en base.
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  VALID_DESIGNS,
  computeCartTotals,
  computeUnitPriceXof,
  type DesignSpec,
  type Pattern,
} from '@streetwear/shared';
import { createHttpApi } from '../src/api/http';
import { ApiError } from '../src/api/types';

type Tokens = { accessToken: string; refreshToken: string };
let stored: Tokens | null = null;
const tokens = {
  get: async () => stored,
  set: async (t: Tokens) => {
    stored = t;
  },
  clear: async () => {
    stored = null;
  },
};

const baseUrl = process.env.VERIFY_API_URL ?? 'http://localhost:3010/v1';
const envFile = process.env.VERIFY_API_ENV ?? 'apps/api/.env';
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

let expired = 0;
const api = createHttpApi({ baseUrl, tokens, onSessionExpired: () => (expired += 1) });
const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) process.exitCode = 1;
};
const codeOf = async (p: Promise<unknown>) =>
  p.then(
    () => 'no-error',
    (e: unknown) => (e instanceof ApiError ? e.code : `other:${String(e)}`),
  );

function otpFor(phone: string): string {
  const hash = execFileSync(
    'psql',
    [
      env.DATABASE_URL as string,
      '-Atc',
      `select code_hash from otp_codes where phone='${phone}' and consumed_at is null order by created_at desc limit 1`,
    ],
    { encoding: 'utf8' },
  ).trim();
  for (let i = 0; i < 1_000_000; i += 1) {
    const code = String(i).padStart(6, '0');
    if (
      createHmac('sha256', env.JWT_SECRET as string)
        .update(`${phone}:${code}`)
        .digest('hex') === hash
    ) {
      return code;
    }
  }
  throw new Error('code introuvable');
}

async function main() {
  const categories = await api.listCategories();
  const patterns = (await api.listPatterns()).items;
  const colors = await api.listColors();
  const fonts = await api.listFonts();
  const pricing = await api.getPricing();
  check(
    'catalogue',
    categories.length > 0 && patterns.length > 0 && colors.length > 0 && fonts.length > 0,
    `${patterns.length} motifs, ${colors.length} couleurs`,
  );
  const color = colors[0];
  const pattern = patterns[0];
  if (!color || !pattern) throw new Error('catalogue vide');
  const availability = await api.getAvailability(color.id);
  check(
    'disponibilité par taille',
    availability.sizes.length === 7,
    availability.sizes
      .filter((s) => !s.available)
      .map((s) => s.size)
      .join(',') || 'tout disponible',
  );
  check('banned-words (route proposée)', (await codeOf(api.getBannedWords())) === 'no-error');

  check(
    'panier sans session -> UNAUTHENTICATED',
    (await codeOf(api.getCart())) === 'UNAUTHENTICATED',
  );

  const phone = `+2289${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  await api.requestOtp(phone);
  const code = otpFor(phone);
  const wrong = code === '000000' ? '000001' : '000000';
  check('OTP faux -> OTP_INVALID', (await codeOf(api.verifyOtp(phone, wrong))) === 'OTP_INVALID');
  const auth = await api.verifyOtp(phone, code);
  await tokens.set({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
  check('OTP valide', auth.isNewUser && auth.user.phone === phone);

  let last = '';
  const phone2 = `+2289${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  await api.requestOtp(phone2);
  const real2 = otpFor(phone2);
  for (let i = 0; i < 6; i += 1)
    last = await codeOf(api.verifyOtp(phone2, real2 === '111111' ? '222222' : '111111'));
  check('5 essais faux -> OTP_ATTEMPTS_EXCEEDED', last === 'OTP_ATTEMPTS_EXCEEDED', last);

  const me = await api.updateMe({ name: 'Test Mobile' });
  check('PATCH /me', me.name === 'Test Mobile');

  const spec: DesignSpec = JSON.parse(JSON.stringify(VALID_DESIGNS.patternOnly));
  spec.colorId = color.id;
  const layer = spec.zones.front?.layers[0];
  if (layer && layer.type === 'pattern') layer.patternId = pattern.id;
  const design = await api.createDesign({ spec });
  const local = computeUnitPriceXof(spec, pricing, { [pattern.id]: pattern as Pattern });
  check(
    'création de design, prix API = prix partagé',
    design.unitPriceXof === local,
    `${design.unitPriceXof} XOF`,
  );

  const cart = await api.addCartItem({ designId: design.id, size: 'M', quantity: 3 });
  const totals = computeCartTotals(cart.items, 0);
  check(
    'panier : sous-total API = calcul partagé',
    cart.subtotalXof === totals.subtotalXof && cart.itemCount === 3,
    `${cart.subtotalXof} XOF`,
  );
  const line = cart.items[0];
  const updated = line ? await api.updateCartItem(line.id, { quantity: 5 }) : cart;
  check('quantité mise à jour', updated.items[0]?.quantity === 5);

  stored = { accessToken: 'jeton-invalide', refreshToken: stored?.refreshToken ?? '' };
  const before = stored.refreshToken;
  const afterRefresh = await api.getCart();
  check(
    'jeton expiré -> rafraîchissement automatique',
    afterRefresh.items.length === 1 && stored?.refreshToken !== before && expired === 0,
  );

  const stores = (await (await fetch(`${baseUrl}/stores`)).json()) as { id: string }[];
  const store = stores[0];
  let slot: { id: string; remaining: number } | undefined;
  for (let d = 1; store && !slot && d <= 8; d += 1) {
    const day = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl}/stores/${store.id}/slots?date=${day}`, {
      headers: { Authorization: `Bearer ${stored?.accessToken}` },
    });
    const list = (await res.json()) as { id: string; remaining: number }[];
    slot = Array.isArray(list) ? list.find((x) => x.remaining > 0) : undefined;
  }
  if (store && slot) {
    const quote = await api.quoteCart({ type: 'pickup', storeId: store.id, slotId: slot.id });
    check(
      'devis retrait : total = sous-total',
      quote.totalXof === afterRefresh.subtotalXof && quote.deliveryFeeXof === 0,
      `${quote.totalXof} XOF`,
    );
  } else {
    const res = await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stored?.accessToken}`,
      },
      body: JSON.stringify({
        label: 'Maison',
        lat: 6.17,
        lng: 1.23,
        district: 'Adidogomé',
        landmark: 'Près du marché',
        recipientPhone: phone,
      }),
    });
    const address = (await res.json()) as { id?: string; zone?: { feeXof: number } | null };
    const quote = address.id ? await api.quoteCart({ type: 'home', addressId: address.id }) : null;
    check(
      'devis livraison : total = sous-total + frais de zone',
      !!quote && quote.totalXof === afterRefresh.subtotalXof + (address.zone?.feeXof ?? -1),
      quote ? `${quote.totalXof} XOF dont ${quote.deliveryFeeXof} de livraison` : 'adresse refusée',
    );
  }

  const empty = await api.removeCartItem(afterRefresh.items[0]?.id ?? '');
  check('suppression de ligne', empty.items.length === 0);

  const refresh = stored?.refreshToken ?? '';
  await api.logout(refresh);
  stored = { accessToken: 'jeton-invalide', refreshToken: refresh };
  check(
    'après déconnexion, le jeton de rafraîchissement est refusé',
    (await codeOf(api.getCart())) === 'UNAUTHENTICATED' && expired === 1,
  );
}

main()
  .catch((e: unknown) => {
    results.push(`FAIL exception : ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log(results.join('\n'));
  });
