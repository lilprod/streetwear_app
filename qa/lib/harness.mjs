// Harnais commun des scripts de recette SP12-B. Node 22, aucune dépendance.
// L'API et la base viennent de apps/api/.env (non commité) ; API_URL et DATABASE_URL peuvent le surcharger.
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = join(QA_DIR, '..');

function loadDotEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(ROOT, 'apps/api/.env'), 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* pas de .env : variables d'environnement seulement */
  }
  return { ...out, ...process.env };
}
export const ENV = loadDotEnv();
export const PORT = ENV.PORT ?? '3100';
export const API = ENV.API_URL ?? `http://localhost:${PORT}/v1`;
export const DB = ENV.DATABASE_URL;
export const WEBHOOK_SECRET = ENV.FAKE_PAYMENT_WEBHOOK_SECRET;
export const JWT_SECRET = ENV.JWT_SECRET;
export const DEMO_PASSWORD = 'DemoLocal-2026!';
export const DEMO_TOTP = 'JBSWY3DPEHPK3PXP';
export const ROLES = ['super_admin', 'order_manager', 'production', 'logistics', 'courier'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- SQL (psql) -------------------------------------------------------------------------------
export function sql(query) {
  const out = execFileSync('psql', [DB, '-Atq', '-F', '|', '-c', query], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter((l) => l !== '' && !/^(INSERT|UPDATE|DELETE) \d/.test(l))
    .map((l) => l.split('|'));
}
export const sqlOne = (query) => sql(query)[0]?.[0];

// ---- HTTP -------------------------------------------------------------------------------------
export async function http(method, path, { token, body, headers = {}, raw, base = API } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) {
    payload = JSON.stringify(body);
    h['content-type'] ??= 'application/json';
  }
  const t0 = performance.now();
  const res = await fetch(base + path, { method, headers: h, body: payload });
  const ms = performance.now() - t0;
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* corps non JSON (PDF…) */
  }
  return { status: res.status, body: json, text, headers: res.headers, ms };
}

// ---- TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) -------------------------------------------------
function base32(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alpha.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secret, offsetSteps = 0) {
  const counter = Math.floor(Date.now() / 30_000) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32(secret)).update(buf).digest();
  const o = h[19] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const demoEmail = (role) => `${role.replace('_', '-')}@demo.streetwear.local`;

/** Connexion admin complète (mot de passe + TOTP pour les rôles hors livreur). */
export async function adminLogin(role, { email = demoEmail(role), password = DEMO_PASSWORD } = {}) {
  const r = await http('POST', '/admin/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${role}: ${r.status} ${r.text}`);
  if (r.body.type === 'session') return r.body.session;
  const secret = r.body.enrollment?.secret ?? DEMO_TOTP;
  for (const off of [0, 1, -1]) {
    const t = await http('POST', '/admin/auth/totp', {
      body: { challenge: r.body.challenge, code: totp(secret, off) },
    });
    if (t.status === 200) return t.body;
  }
  throw new Error(`totp ${role} refusé`);
}

export async function allAdminTokens() {
  const out = {};
  for (const role of ROLES) out[role] = (await adminLogin(role)).accessToken;
  return out;
}

// ---- Clients ----------------------------------------------------------------------------------
const codeHash = (phone, code) =>
  createHmac('sha256', JWT_SECRET).update(`${phone}:${code}`).digest('hex');

/** Crée le code OTP directement en base (le SMS factice ne montre pas le code) puis vérifie par l'API réelle. */
export async function customerLogin(phone) {
  const code = '424242';
  sql(
    `UPDATE otp_codes SET consumed_at = now() WHERE phone='${phone}' AND consumed_at IS NULL;` +
      `INSERT INTO otp_codes(id,phone,code_hash,expires_at,updated_at) VALUES (gen_random_uuid(),'${phone}','${codeHash(phone, code)}', now() + interval '5 minutes', now())`,
  );
  const r = await http('POST', '/auth/otp/verify', { body: { phone, code } });
  if (r.status !== 200) throw new Error(`otp verify ${phone}: ${r.status} ${r.text}`);
  return { token: r.body.accessToken, userId: r.body.user.id, phone };
}

const b64u = (o) =>
  Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
/** Jeton HS256 identique à celui de l'API (JWT_SECRET du .env local). Sert aux fixtures : /auth/otp/verify est limité à 10/min/IP. */
export function signJwt(claims, ttlSec = 900) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ ...claims, iat: now, exp: now + ttlSec })}`;
  return `${head}.${createHmac('sha256', JWT_SECRET).update(head).digest('base64url')}`;
}

let phoneSeq = Math.floor(Math.random() * 1_000_000);
/** Clients de test : ligne `users` insérée en SQL + jeton signé (hors parcours OTP, couvert par la sécurité). */
export async function customers(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    phoneSeq += 1;
    const phone = `+2289${String(phoneSeq % 10_000_000).padStart(7, '0')}`;
    const id = uuid();
    sql(
      `INSERT INTO users(id,phone,name,updated_at) VALUES ('${id}','${phone}','QA ${phoneSeq}', now())`,
    );
    out.push({ token: signJwt({ typ: 'customer', sub: id }), userId: id, phone });
  }
  return out;
}

export const DESIGN = (colorId = 'col-noir') => ({
  version: 1,
  colorId,
  zones: {
    front: {
      layers: [
        {
          type: 'pattern',
          id: randomUUID(),
          patternId: 'pat-kente-ewe',
          x: 20,
          y: 40,
          width: 250,
          height: 250,
          rotation: 0,
          repeat: 'none',
          tileScale: 1,
        },
      ],
    },
  },
});

export const uuid = randomUUID;

/** Vide le panier, y met `qty` × (colorId, size), renvoie le designId. */
export async function fillCart(token, { colorId = 'col-noir', size = 'M', qty = 1 } = {}) {
  const d = await http('POST', '/designs', { token, body: { spec: DESIGN(colorId), name: 'qa' } });
  if (d.status !== 201) throw new Error(`design: ${d.status} ${d.text}`);
  const c = await http('GET', '/cart', { token });
  for (const it of c.body?.items ?? []) await http('DELETE', `/cart/items/${it.id}`, { token });
  const a = await http('POST', '/cart/items', {
    token,
    body: { designId: d.body.id, size, quantity: qty },
  });
  if (a.status !== 201 && a.status !== 200) throw new Error(`cart: ${a.status} ${a.text}`);
  return d.body.id;
}

export function placeOrder(token, { reception, paymentMethod = 'tmoney', key = uuid() }) {
  return http('POST', '/orders', {
    token,
    body: { reception, paymentMethod },
    headers: { 'idempotency-key': key },
  });
}

export function pay(
  token,
  orderId,
  { method = 'tmoney', payerPhone = '+22890000011', key = uuid() } = {},
) {
  return http('POST', `/orders/${orderId}/payments`, {
    token,
    body: { method, payerPhone },
    headers: { 'idempotency-key': key },
  });
}

// ---- Webhooks (agrégateur factice) -------------------------------------------------------------
export function signedWebhook({
  ref,
  paymentId,
  amount,
  status = 'succeeded',
  currency = 'XOF',
  secret = WEBHOOK_SECRET,
}) {
  const body = JSON.stringify({
    event: 'payment.updated',
    reference: ref,
    merchantReference: paymentId,
    status,
    amount,
    currency,
    occurredAt: new Date().toISOString(),
  });
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return { body, headers: { 'content-type': 'application/json', 'x-fake-signature': sig } };
}
export const sendWebhook = (w) =>
  http('POST', '/webhooks/payments/fake', { raw: w.body, headers: w.headers });

// ---- Fixtures de stock et de créneaux -----------------------------------------------------------
export const STORE_ID = () => sqlOne('SELECT id FROM stores ORDER BY id LIMIT 1');
export function setStock(colorId, size, onHand, reserved = 0) {
  sql(
    `UPDATE stock_items SET on_hand=${onHand}, reserved=${reserved} WHERE color_id='${colorId}' AND size='${size}'`,
  );
}
/** Crée un créneau de retrait demain (hors créneaux de démonstration) et renvoie son id. */
export function makeSlot(capacity) {
  const id = uuid();
  const store = STORE_ID();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const offsetMin = Math.floor(Math.random() * 1_000_000);
    try {
      sql(
        `INSERT INTO pickup_slots(id,store_id,starts_at,ends_at,capacity,booked) VALUES ('${id}','${store}', date_trunc('minute', now()) + interval '2 days' + interval '${offsetMin} minutes', date_trunc('minute', now()) + interval '2 days' + interval '${offsetMin + 30} minutes', ${capacity}, 0)`,
      );
      return id;
    } catch {
      /* collision sur (store, starts_at) : nouveau tirage */
    }
  }
  throw new Error('makeSlot: collisions répétées');
}

// ---- Compte rendu de scénario -------------------------------------------------------------------
export class Scenario {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.checks = [];
    this.sql = [];
    this.notes = [];
    this.t0 = Date.now();
  }
  /** Compare attendu et obtenu (JSON) ; une anomalie ne masque pas la suite. */
  expect(label, expected, obtained) {
    const ok = JSON.stringify(expected) === JSON.stringify(obtained);
    this.checks.push({ label, expected, obtained, ok });
    console.log(
      `  ${ok ? 'OK ' : 'KO '} ${label} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(obtained)}`,
    );
    return ok;
  }
  expectTrue(label, cond, detail = '') {
    return (
      this.expect(label, true, Boolean(cond)) || (this.notes.push(`${label}: ${detail}`), false)
    );
  }
  /** Requête SQL de contrôle, rejouable telle quelle. */
  control(label, query) {
    const rows = sql(query);
    this.sql.push({ label, query, rows });
    console.log(`  SQL ${label}: ${JSON.stringify(rows)}`);
    return rows;
  }
  note(text) {
    this.notes.push(text);
    console.log(`  NOTE ${text}`);
  }
  get ok() {
    return this.checks.every((c) => c.ok);
  }
  finish(file) {
    const result = {
      id: this.id,
      title: this.title,
      ok: this.ok,
      ms: Date.now() - this.t0,
      checks: this.checks,
      sql: this.sql,
      notes: this.notes,
    };
    console.log(`${this.ok ? 'PASS' : 'FAIL'} ${this.id} ${this.title}`);
    if (file) {
      mkdirSync(join(QA_DIR, 'results'), { recursive: true });
      writeFileSync(join(QA_DIR, 'results', file), JSON.stringify(result, null, 2));
    }
    return result;
  }
}

export const countBy = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
