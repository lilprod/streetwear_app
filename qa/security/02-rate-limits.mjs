// S-RATE : limitation de débit OTP, connexion admin, global ; verrouillage admin après 5 échecs.
// Démarre sa propre API sur :3101 avec la limite PAR DÉFAUT (100/min), sans worker, pour ne pas polluer les autres scénarios.
// Durée ≈ 6 min (fenêtres de 60 s à laisser s'écouler entre les essais).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  QA_DIR,
  ROOT,
  Scenario,
  adminLogin,
  countBy,
  http,
  sleep,
  sql,
  uuid,
} from '../lib/harness.mjs';
import { createHmac } from 'node:crypto';
import { runIfMain } from '../lib/flows.mjs';
import { JWT_SECRET } from '../lib/harness.mjs';

const BASE = 'http://localhost:3101/v1';
const stack = (cmd) =>
  execFileSync('bash', [join(QA_DIR, 'stack.sh'), cmd], {
    env: { ...process.env, PORT: '3101', RATE: '100', WORKER: '0', TRUST_PROXY: '1' },
    encoding: 'utf8',
  });
const h = (method, path, opts = {}) => http(method, path, { ...opts, base: BASE });
const phone = () => `+2289${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const window = () => sleep(61_000);

export async function run() {
  // Les compteurs sont dans Redis, partagés avec l'API :3100 (même IP) : laisser s'écouler la fenêtre des scénarios précédents.
  await window();
  stack('start');
  const out = [];
  try {
    // ---- OTP : 3 envois / heure / numéro ----
    const s1 = new Scenario('S-RATE-1', 'OTP : 3 envois par heure et par numéro');
    {
      const p = phone();
      const codes = [];
      for (let i = 0; i < 4; i += 1) {
        const r = await h('POST', '/auth/otp/request', { body: { phone: p } });
        codes.push([r.status, r.body?.error?.code, r.body?.error?.details?.retryAfterMinutes]);
      }
      s1.expect(
        'envois 1 à 3 : 204 ; 4e : 429 RATE_LIMITED avec retryAfterMinutes',
        [[204], [204], [204], [429, 'RATE_LIMITED']],
        codes.map((c, i) => (i < 3 ? [c[0]] : [c[0], c[1]])),
      );
      s1.expectTrue(
        'retryAfterMinutes présent et ≤ 60',
        codes[3][2] >= 1 && codes[3][2] <= 60,
        JSON.stringify(codes[3]),
      );
      s1.expect(
        '3 codes en base, pas 4',
        '3',
        s1.control('otp_codes', `SELECT count(*) FROM otp_codes WHERE phone='${p}'`)[0][0],
      );
    }
    out.push(s1.finish('security-rate-1.json'));

    // ---- OTP : essais de vérification ----
    await window();
    const s2 = new Scenario('S-RATE-2', 'OTP : 5 mauvais codes bloquent le code (même le bon)');
    {
      const p = phone();
      const code = '123456';
      sql(
        `INSERT INTO otp_codes(id,phone,code_hash,expires_at,updated_at) VALUES (gen_random_uuid(),'${p}','${createHmac('sha256', JWT_SECRET).update(`${p}:${code}`).digest('hex')}', now() + interval '5 minutes', now())`,
      );
      const res = [];
      for (let i = 0; i < 5; i += 1)
        res.push(
          (await h('POST', '/auth/otp/verify', { body: { phone: p, code: '000000' } })).body?.error
            ?.code,
        );
      s2.expect(
        '5 essais faux : OTP_INVALID ×4 puis OTP_ATTEMPTS_EXCEEDED',
        ['OTP_INVALID', 'OTP_INVALID', 'OTP_INVALID', 'OTP_INVALID', 'OTP_ATTEMPTS_EXCEEDED'],
        res,
      );
      const good = await h('POST', '/auth/otp/verify', { body: { phone: p, code } });
      s2.expect(
        'bon code après 5 échecs : refusé',
        [400, 'OTP_ATTEMPTS_EXCEEDED'],
        [good.status, good.body?.error?.code],
      );
    }
    out.push(s2.finish('security-rate-2.json'));

    // ---- OTP : plafond par IP ----
    await window();
    const s3 = new Scenario(
      'S-RATE-3',
      'OTP : plafond par client réel (10/min) derrière un proxy de confiance (TRUST_PROXY=1)',
    );
    {
      const send = (ip) =>
        h('POST', '/auth/otp/request', {
          body: { phone: phone() },
          headers: { 'x-forwarded-for': ip },
        });
      const distinct = [];
      for (let i = 0; i < 12; i += 1) distinct.push((await send(`10.9.${i}.1`)).status);
      const by = countBy(distinct, (x) => x);
      s3.expect(
        '12 demandes de 12 X-Forwarded-For distincts : 12 × 204 (un compteur par client)',
        { 204: 12 },
        { 204: by[204] ?? 0 },
      );
      const same = [];
      for (let i = 0; i < 12; i += 1) same.push((await send('10.9.200.1')).status);
      const bySame = countBy(same, (x) => x);
      s3.expect(
        '12 demandes du même client : 10 × 204 puis 2 × 429',
        { 204: 10, 429: 2 },
        { 204: bySame[204] ?? 0, 429: bySame[429] ?? 0 },
      );
      s3.note(
        'API lancée avec TRUST_PROXY=1 (un proxy de confiance). Sans TRUST_PROXY, X-Forwarded-For est ignoré et tous les clients partagent un compteur : couvert par apps/api/test/rate-limits.spec.ts.',
      );
    }
    out.push(s3.finish('security-rate-3.json'));

    // ---- Admin : verrouillage 5 échecs ----
    await window();
    const s4 = new Scenario(
      'S-RATE-4',
      'Connexion admin : verrouillage 15 min après 5 échecs, pas d’énumération de comptes',
    );
    {
      const sa = await adminLogin('super_admin', {}).catch(() => null);
      const created = await h('POST', '/admin/users', {
        token: sa?.accessToken,
        body: {
          email: `qa-lock-${uuid().slice(0, 8)}@streetwear.test`,
          name: 'QA lock',
          role: 'order_manager',
          password: 'QaLock-2026-Pass!',
        },
      });
      s4.expect('compte de test créé', 201, created.status);
      const email = created.body?.email;
      const codes = [];
      for (let i = 0; i < 5; i += 1)
        codes.push(
          (await h('POST', '/admin/auth/login', { body: { email, password: 'faux-mot-de-passe' } }))
            .body?.error?.code,
        );
      s4.expect(
        '5 mots de passe faux : 4 x INVALID_CREDENTIALS puis ACCOUNT_LOCKED dès le 5e échec',
        [
          'INVALID_CREDENTIALS',
          'INVALID_CREDENTIALS',
          'INVALID_CREDENTIALS',
          'INVALID_CREDENTIALS',
          'ACCOUNT_LOCKED',
        ],
        codes,
      );
      const good = await h('POST', '/admin/auth/login', {
        body: { email, password: 'QaLock-2026-Pass!' },
      });
      s4.expect(
        'bon mot de passe pendant le verrouillage : 403 ACCOUNT_LOCKED',
        [403, 'ACCOUNT_LOCKED'],
        [good.status, good.body?.error?.code],
      );
      s4.expectTrue(
        'retryAfterMinutes ≈ 15',
        good.body?.error?.details?.retryAfterMinutes >= 14 &&
          good.body.error.details.retryAfterMinutes <= 15,
        JSON.stringify(good.body?.error),
      );
      s4.expect(
        'locked_until ≈ +15 min en base',
        '15',
        s4.control(
          'verrou',
          `SELECT round(extract(epoch FROM (locked_until - now()))/60) FROM admin_users WHERE email='${email}'`,
        )[0][0],
      );
      const unknown = await h('POST', '/admin/auth/login', {
        body: { email: 'inconnu@streetwear.test', password: 'faux-mot-de-passe' },
      });
      const wrong = await h('POST', '/admin/auth/login', {
        body: { email: 'order-manager@demo.streetwear.local', password: 'faux-mot-de-passe' },
      });
      s4.expect(
        'compte inconnu et mot de passe faux : réponses identiques (pas d’énumération)',
        [unknown.status, unknown.body],
        [wrong.status, wrong.body],
      );
      sql(
        `UPDATE admin_users SET failed_logins=0, locked_until=NULL WHERE email='order-manager@demo.streetwear.local'`,
      );
    }
    out.push(s4.finish('security-rate-4.json'));

    // ---- Admin : plafond par IP ----
    await window();
    const s5 = new Scenario('S-RATE-5', 'Connexion admin : plafond par IP (20/min)');
    {
      const res = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          h('POST', '/admin/auth/login', {
            body: { email: `x${i}@streetwear.test`, password: 'faux-mot-de-passe' },
          }),
        ),
      );
      const by = countBy(res, (r) => r.status);
      s5.expect(
        '25 tentatives : 20 × 401 puis 5 × 429',
        { 401: 20, 429: 5 },
        { 401: by[401] ?? 0, 429: by[429] ?? 0 },
      );
      s5.expect('code 429', 'RATE_LIMITED', res.find((r) => r.status === 429)?.body?.error?.code);
    }
    out.push(s5.finish('security-rate-5.json'));

    // ---- Global ----
    await window();
    const s6 = new Scenario('S-RATE-6', 'Limite globale (contrat : 100 req/min par IP)');
    {
      const a = await Promise.all(Array.from({ length: 105 }, () => h('GET', '/catalog/colors')));
      const b = await Promise.all(
        Array.from({ length: 60 }, () => h('GET', '/catalog/categories')),
      );
      const ca = countBy(a, (r) => r.status);
      const cb = countBy(b, (r) => r.status);
      s6.expect(
        '105 requêtes sur une route : 100 × 200 puis 5 × 429',
        { 200: 100, 429: 5 },
        { 200: ca[200] ?? 0, 429: ca[429] ?? 0 },
      );
      s6.expect(
        '60 requêtes sur une AUTRE route dans la même minute (contrat « par IP » : 429 attendu, 160 > 100)',
        { 429: 60 },
        { 429: cb[429] ?? 0 },
      );
      s6.note(
        'Compteur global par client (toutes routes), stocké dans Redis donc partagé entre instances ; les webhooks de paiement et /health en sont exclus.',
      );
    }
    out.push(s6.finish('security-rate-6.json'));
  } finally {
    stack('stop');
  }
  return out;
}
void ROOT;
await runIfMain(import.meta.url, run);
