/**
 * Vérifie le vrai client API du mobile (src/api/http.ts) contre une API locale.
 * Usage : apps/api/node_modules/.bin/tsx apps/mobile/scripts/verify-real-api.ts
 * Variables : VERIFY_API_URL (défaut http://localhost:3010/v1), VERIFY_API_ENV (défaut apps/api/.env).
 * Couvre : adresse, zone, devis, commande, paiement fake (double appui, attente, échec, acompte, carte), suivi, reçu, push-token, retrait et SLOT_FULL.
 * Le code OTP n'est jamais journalisé par l'API : il est retrouvé en recalculant le HMAC stocké en base.
 */
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
  // Base de vérification dédiée : le script est rejouable (stock remis à niveau, TOTP admin réinitialisé).
  execFileSync(
    'psql',
    [
      env.DATABASE_URL as string,
      '-Atc',
      `update stock_items set on_hand=100, reserved=0; update admin_users set totp_secret=null where email='${env.SEED_ADMIN_EMAIL}'`,
    ],
    { encoding: 'utf8' },
  );
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

  // Les deux derniers chiffres pilotent le scénario du fake (00 à 03) : on les évite pour le numéro principal.
  const phone = `+2289${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`.replace(
    /0[0-3]$/,
    '55',
  );
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
  const updated = line ? await api.updateCartItem(line.id, { quantity: 2 }) : cart;
  check('quantité mise à jour', updated.items[0]?.quantity === 2);

  stored = { accessToken: 'jeton-invalide', refreshToken: stored?.refreshToken ?? '' };
  const before = stored.refreshToken;
  const afterRefresh = await api.getCart();
  check(
    'jeton expiré -> rafraîchissement automatique',
    afterRefresh.items.length === 1 && stored?.refreshToken !== before && expired === 0,
  );

  // ---- Lot B : réception, commande, paiement, suivi, reçu, push, retrait ----
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const sql = (q: string) =>
    execFileSync('psql', [env.DATABASE_URL as string, '-Atc', q], { encoding: 'utf8' }).trim();
  const home = { lat: 6.17, lng: 1.23 };

  const zone = await api.resolveZone(home.lat, home.lng);
  check(
    'zone résolue en direct (dans la zone)',
    !!zone,
    zone ? `${zone.name}, ${zone.feeXof} XOF` : '',
  );
  check('hors zone -> null (404 NOT_FOUND converti)', (await api.resolveZone(0, 0)) === null);
  const address = await api.createAddress({
    label: 'Maison',
    ...home,
    district: 'Adidogomé',
    landmark: 'Près du marché',
    recipientPhone: phone,
  });
  check('adresse créée avec sa zone', address.zone?.id === zone?.id, address.id);
  check(
    'liste des adresses',
    (await api.listAddresses()).some((a) => a.id === address.id),
  );
  const patched = await api.updateAddress(address.id, { landmark: 'Portail bleu' });
  check('adresse modifiée', patched.landmark === 'Portail bleu');
  const homeQuote = await api.quoteCart({ type: 'home', addressId: address.id });
  check(
    'devis livraison : total = sous-total + frais de zone',
    homeQuote.totalXof === afterRefresh.subtotalXof + (address.zone?.feeXof ?? -1),
    `${homeQuote.totalXof} XOF dont ${homeQuote.deliveryFeeXof} de livraison`,
  );

  const farAddress = await api.createAddress({
    label: 'Loin',
    lat: 0,
    lng: 0,
    district: 'Ailleurs',
    landmark: 'Quelque part',
    recipientPhone: phone,
  });
  check(
    'devis hors zone -> OUT_OF_ZONE',
    (await codeOf(api.quoteCart({ type: 'home', addressId: farAddress.id }))) === 'OUT_OF_ZONE',
  );
  await api.deleteAddress(farAddress.id);
  check('adresse supprimée', !(await api.listAddresses()).some((a) => a.id === farAddress.id));

  // Retrait : le seed n'a pas de créneau, on en crée via l’API admin (TOTP calculé avec otplib de l'API).
  const stores = await api.listStores();
  const store = stores[0];
  check('boutique de retrait', !!store, store?.name ?? '');
  const adminBase = baseUrl;
  type AdminBody = {
    enrollment?: { secret: string };
    challenge?: string;
    accessToken?: string;
  } | null;
  const adminCall = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${adminBase}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as AdminBody };
  };
  const loginRes = await adminCall('POST', '/admin/auth/login', {
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
  });
  const { authenticator } = createRequire(resolve('apps/api/package.json'))('otplib') as {
    authenticator: { generate(secret: string): string };
  };
  let adminToken = '';
  if (loginRes.body?.enrollment?.secret) {
    const totp = await adminCall('POST', '/admin/auth/totp', {
      challenge: loginRes.body.challenge,
      code: authenticator.generate(loginRes.body.enrollment.secret),
    });
    adminToken = totp.body?.accessToken ?? '';
  }
  check('connexion admin (TOTP)', adminToken !== '');
  const firstDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const slotsOf = async (date: string) => (store ? api.listSlots(store.id, date) : []);
  const findSlot = async () => {
    for (let d = 1; d <= 8; d += 1) {
      const day = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
      const list = await slotsOf(day);
      if (list.length > 0) return list;
    }
    return [];
  };
  let slots = await findSlot();
  const hadSlots = slots.length > 0;
  if (!hadSlots && store) {
    const gen = await adminCall(
      'POST',
      `/admin/stores/${store.id}/slots`,
      { days: 7, capacity: 3 },
      adminToken,
    );
    check(
      'créneaux générés par l’API admin',
      gen.status === 201 || gen.status === 200,
      `HTTP ${gen.status}`,
    );
    slots = await findSlot();
  }
  check(
    'créneaux de retrait restants',
    slots.length > 0 && slots.every((s) => s.remaining > 0),
    `${slots.length} créneaux, ex. ${firstDay}`,
  );
  const slot = slots[0];
  if (store && slot) {
    const pickupQuote = await api.quoteCart({ type: 'pickup', storeId: store.id, slotId: slot.id });
    check(
      'devis retrait : total = sous-total, livraison 0',
      pickupQuote.totalXof === afterRefresh.subtotalXof && pickupQuote.deliveryFeeXof === 0,
      `${pickupQuote.totalXof} XOF`,
    );
  }

  // Commande + paiement avec Idempotency-Key
  const reception = { type: 'home', addressId: address.id } as const;
  const orderKey = randomUUID();
  const order = await api.createOrder({ reception, paymentMethod: 'tmoney' }, orderKey);
  const replayed = await api.createOrder({ reception, paymentMethod: 'tmoney' }, orderKey);
  check(
    'POST /orders rejoué avec la même clé -> même commande',
    replayed.id === order.id && order.status === 'pending_payment',
    order.number,
  );
  check('total commande = devis', order.totalXof === homeQuote.totalXof, `${order.totalXof} XOF`);
  check(
    'même clé, autre corps -> IDEMPOTENCY_CONFLICT',
    (await codeOf(api.createOrder({ reception, paymentMethod: 'flooz' }, orderKey))) ===
      'IDEMPOTENCY_CONFLICT',
  );
  check('panier vidé par la commande', (await api.getCart()).items.length === 0);

  const payKey = randomUUID();
  const body = { method: 'tmoney', payerPhone: phone } as const;
  const [p1, p2] = await Promise.all([
    api.createPayment(order.id, body, payKey),
    api.createPayment(order.id, body, payKey),
  ]);
  const paymentRows = sql(`select count(*) from payments where order_id='${order.id}'`);
  check(
    'double appui « Payer » (même clé) -> un seul paiement',
    p1.paymentId === p2.paymentId && paymentRows === '1',
    `paymentId ${p1.paymentId.slice(0, 8)}, ${paymentRows} ligne en base`,
  );
  check(
    'nextAction approve_on_phone',
    p1.nextAction.type === 'approve_on_phone' && p1.status === 'pending' && p1.kind === 'full',
  );
  const third = await api.createPayment(order.id, body, payKey);
  check('rejeu tardif de la même clé -> même paiement', third.paymentId === p1.paymentId);
  const other = await codeOf(api.createPayment(order.id, body, randomUUID()));
  check('autre clé pendant l’attente -> ORDER_NOT_PAYABLE', other === 'ORDER_NOT_PAYABLE', other);
  try {
    await api.createPayment(order.id, body, randomUUID());
  } catch (e) {
    const reason = (e as ApiError).details as { reason?: string } | undefined;
    check('details.reason = payment_pending', reason?.reason === 'payment_pending');
  }

  // Attente comme le fait l'app : interrogation, jamais « payée » avant le statut de l'API
  let sawPending = false;
  let pendingLeak = false;
  let finalStatus = '';
  let orderStatus = '';
  for (let i = 0; i < 40; i += 1) {
    const res = await api.getPayment(p1.paymentId);
    if (res.status === 'pending') {
      sawPending = true;
      if (res.orderStatus !== 'pending_payment') pendingLeak = true;
    }
    finalStatus = res.status;
    orderStatus = res.orderStatus;
    if (res.status !== 'pending') break;
    await sleep(500);
  }
  check('commande non payée tant que le paiement est pending', sawPending && !pendingLeak);
  check(
    'attente jusqu’à « payée » (webhook posté par le fake)',
    finalStatus === 'succeeded' && orderStatus === 'paid',
    `pending vu : ${sawPending}, statut ${finalStatus}/${orderStatus}`,
  );

  const tracked = await api.getOrder(order.id);
  check(
    'suivi : statut paid et historique',
    tracked.status === 'paid' && tracked.history.some((h) => h.status === 'paid'),
    tracked.history.map((h) => h.status).join(' > '),
  );
  const list = await api.listOrders();
  check(
    'liste des commandes',
    list.items.some((o) => o.id === order.id),
  );
  const pdf = await api.getReceiptPdf(order.id);
  check('reçu PDF', new TextDecoder().decode(pdf.slice(0, 5)) === '%PDF-', `${pdf.length} octets`);
  check(
    'reçu refusé tant que la commande n’est pas payée',
    (await codeOf(
      (async () => {
        const o2 = await api
          .reorder(order.id)
          .then(() => api.createOrder({ reception, paymentMethod: 'tmoney' }, randomUUID()));
        return api.getReceiptPdf(o2.id);
      })(),
    )) !== 'no-error',
  );

  await api.registerPushToken({ token: 'ExponentPushToken[verify-sp10b]', platform: 'android' });
  await api.registerPushToken({ token: 'ExponentPushToken[verify-sp10b]', platform: 'android' });
  check(
    'POST /me/push-tokens (idempotent)',
    sql(`select count(*) from push_tokens where token='ExponentPushToken[verify-sp10b]'`) === '1',
  );

  // Échec puis réessai sur la même commande
  await api.reorder(order.id);
  const failOrder = await api.createOrder({ reception, paymentMethod: 'flooz' }, randomUUID());
  const failPhone = `${phone.slice(0, -2)}00`;
  const failPay = await api.createPayment(
    failOrder.id,
    { method: 'flooz', payerPhone: failPhone },
    randomUUID(),
  );
  let failStatus = 'pending';
  for (let i = 0; i < 40 && failStatus === 'pending'; i += 1) {
    failStatus = (await api.getPayment(failPay.paymentId)).status;
    if (failStatus === 'pending') await sleep(500);
  }
  check('paiement refusé (scénario 00) -> failed', failStatus === 'failed', failStatus);
  check('commande payment_failed', (await api.getOrder(failOrder.id)).status === 'payment_failed');
  const retryKey = randomUUID();
  const retry = await api.createPayment(
    failOrder.id,
    { method: 'flooz', payerPhone: phone },
    retryKey,
  );
  let retryStatus = 'pending';
  for (let i = 0; i < 40 && retryStatus === 'pending'; i += 1) {
    retryStatus = (await api.getPayment(retry.paymentId)).status;
    if (retryStatus === 'pending') await sleep(500);
  }
  check(
    'réessai avec une nouvelle clé sur la même commande -> payée',
    retry.paymentId !== failPay.paymentId &&
      retryStatus === 'succeeded' &&
      (await api.getOrder(failOrder.id)).status === 'paid',
  );

  // Paiement à la livraison : acompte
  await api.reorder(order.id);
  const codOrder = await api.createOrder({ reception, paymentMethod: 'cod' }, randomUUID());
  const codPay = await api.createPayment(
    codOrder.id,
    { method: 'tmoney', payerPhone: phone },
    randomUUID(),
  );
  check(
    'cod : acompte (kind deposit)',
    codPay.kind === 'deposit' &&
      codPay.amountXof === codOrder.depositXof &&
      (codOrder.depositXof ?? 0) > 0,
    `${codPay.amountXof} XOF sur ${codOrder.totalXof}`,
  );
  check(
    'cod : carte refusée (VALIDATION_FAILED)',
    (await codeOf(api.createPayment(codOrder.id, { method: 'card' }, randomUUID()))) ===
      'VALIDATION_FAILED',
  );
  let codStatus = '';
  for (let i = 0; i < 40; i += 1) {
    const res = await api.getPayment(codPay.paymentId);
    codStatus = res.orderStatus;
    if (res.status !== 'pending') break;
    await sleep(500);
  }
  check('cod : commande deposit_paid', codStatus === 'deposit_paid', codStatus);

  // Carte : redirection
  await api.reorder(order.id);
  const cardOrder = await api.createOrder({ reception, paymentMethod: 'card' }, randomUUID());
  const cardPay = await api.createPayment(cardOrder.id, { method: 'card' }, randomUUID());
  check(
    'carte : nextAction redirect avec URL',
    cardPay.nextAction.type === 'redirect',
    cardPay.nextAction.type === 'redirect' ? new URL(cardPay.nextAction.url).origin : '',
  );

  // Retrait + SLOT_FULL
  if (store && slot) {
    await adminCall(
      'PATCH',
      `/admin/stores/${store.id}/slots/${slot.id}`,
      { capacity: 1 },
      adminToken,
    );
    const pickup = { type: 'pickup', storeId: store.id, slotId: slot.id } as const;
    await api.reorder(order.id);
    const pickupOrder = await api.createOrder(
      { reception: pickup, paymentMethod: 'tmoney' },
      randomUUID(),
    );
    check(
      'commande en retrait',
      pickupOrder.reception.type === 'pickup' && pickupOrder.deliveryFeeXof === 0,
      pickupOrder.number,
    );
    const left = (await slotsOf(slot.startsAt.slice(0, 10))).find((s) => s.id === slot.id);
    check('créneau complet retiré de la liste', !left, left ? `reste ${left.remaining}` : 'absent');
    await api.reorder(order.id);
    check(
      'créneau complet -> SLOT_FULL',
      (await codeOf(
        api.createOrder({ reception: pickup, paymentMethod: 'tmoney' }, randomUUID()),
      )) === 'SLOT_FULL',
    );
  }

  // Suppression du compte (anonymisation)
  const refreshBefore = stored?.refreshToken ?? '';
  await api.deleteMe();
  stored = { accessToken: 'jeton-invalide', refreshToken: refreshBefore };
  check(
    'suppression du compte : session et jeton de rafraîchissement refusés ensuite',
    (await codeOf(api.getMe())) === 'UNAUTHENTICATED' && expired === 1,
  );
  check(
    'compte anonymisé en base',
    sql(`select count(*) from users where phone='${phone}'`) === '0',
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
