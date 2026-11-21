// S-ROLES : appelle CHAQUE route /admin/* et /courier/* de l'API compilée avec chaque rôle, un jeton client et sans jeton.
// Les routes viennent des contrôleurs réels (extract-routes.mjs), la matrice attendue du contrat (contract-routes.mjs).
// Un accès « passé » = toute réponse autre que 401/403 (la garde s'exécute avant la validation du corps).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  QA_DIR,
  ROLES,
  Scenario,
  customers,
  http,
  adminLogin,
  sleep,
  signJwt,
  sql,
} from '../lib/harness.mjs';
import { runIfMain } from '../lib/flows.mjs';
import { CONTRACT, CONTRACT_PUBLIC } from './contract-routes.mjs';

const ID = '00000000-0000-4000-8000-0000000000ff';
const STAFF = /^\/(admin|courier)(\/|$)/;
const concrete = (p) => p.replace(/:[A-Za-z]+/g, ID);
const key = (m, p) => `${m} ${p}`;

export async function run() {
  const routes = JSON.parse(
    execFileSync('node', [join(QA_DIR, 'security/extract-routes.mjs')], {
      encoding: 'utf8',
      maxBuffer: 10_000_000,
    }),
  ).filter((r) => STAFF.test(r.path));
  writeFileSync(join(QA_DIR, 'results/routes-code.json'), JSON.stringify(routes, null, 2));

  const s = new Scenario(
    'S-ROLES-1',
    'Matrice des rôles sur toutes les routes /admin/* et /courier/*',
  );

  // ---- Écarts code ↔ contrat ----
  const codeKeys = new Set(routes.map((r) => key(r.method, r.path)));
  const contractKeys = new Set([
    ...CONTRACT.map((c) => key(c.method, c.path)),
    ...CONTRACT_PUBLIC.map(([m, p]) => key(m, p)),
  ]);
  const inCodeNotContract = [...codeKeys].filter((k) => !contractKeys.has(k));
  const inContractNotCode = [...contractKeys].filter((k) => !codeKeys.has(k));
  s.expect('routes présentes dans le code mais absentes du contrat', [], inCodeNotContract);
  s.expect('routes présentes dans le contrat mais absentes du code', [], inContractNotCode);

  // ---- Jetons ----
  const tokens = {};
  for (const role of ROLES) {
    try {
      tokens[role] = (await adminLogin(role)).accessToken;
    } catch (e) {
      if (String(e).includes('429')) {
        await sleep(61_000);
        tokens[role] = (await adminLogin(role)).accessToken;
      } else throw e;
    }
  }
  const [cust] = await customers(1);
  const identities = { sans_jeton: undefined, client: cust.token, ...tokens };

  // ---- Matrice ----
  const expectedRoles = (r) =>
    r.public
      ? 'public'
      : (CONTRACT.find((c) => c.method === r.method && c.path === r.path)?.roles ?? null);
  const matrix = [];
  let calls = 0;
  const unauthorized = [];
  const overRestricted = [];
  const noProof = [];
  for (const r of routes.filter((x) => !x.public)) {
    const exp = expectedRoles(r);
    const row = {
      method: r.method,
      path: r.path,
      codeRoles: r.roles,
      contractRoles: exp,
      results: {},
    };
    for (const [who, token] of Object.entries(identities)) {
      const res = await http(r.method, concrete(r.path), {
        token,
        body: ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method) ? {} : undefined,
      });
      calls += 1;
      row.results[who] = res.status;
      const passed = res.status !== 401 && res.status !== 403;
      if (who === 'sans_jeton' && res.status !== 401)
        noProof.push(`${key(r.method, r.path)} sans jeton → ${res.status}`);
      if (who === 'client' && res.status !== 401)
        unauthorized.push(`${key(r.method, r.path)} jeton client → ${res.status}`);
      if (ROLES.includes(who)) {
        if (passed && !(exp ?? []).includes(who))
          unauthorized.push(`${key(r.method, r.path)} ${who} → ${res.status}`);
        if (!passed && (exp ?? []).includes(who))
          overRestricted.push(`${key(r.method, r.path)} ${who} → ${res.status}`);
      }
    }
    matrix.push(row);
  }
  s.note(
    `${calls} requêtes : ${matrix.length} routes protégées × ${Object.keys(identities).length} identités`,
  );
  s.expect('accès non autorisés (rôle hors contrat ou jeton client)', [], unauthorized);
  s.expect('accès refusés à tort (rôle autorisé par le contrat)', [], overRestricted);
  s.expect('routes protégées sans jeton répondant autre chose que 401', [], noProof);
  s.expect(
    'routes du code sans rôle déclaré et non publiques',
    [],
    routes.filter((r) => !r.public && !r.roles).map((r) => key(r.method, r.path)),
  );
  writeFileSync(
    join(QA_DIR, 'results/security-roles-matrix.json'),
    JSON.stringify({ identities: Object.keys(identities), calls, matrix }, null, 2),
  );

  // ---- Isolation inverse : jeton équipe sur les routes client ----
  const customerRoutes = [
    ['GET', '/me'],
    ['GET', '/cart'],
    ['GET', '/orders'],
    ['GET', '/designs'],
    ['GET', `/orders/${ID}`],
    ['POST', `/orders/${ID}/payments`],
    ['GET', `/payments/${ID}`],
    ['GET', '/me/addresses'],
  ];
  const leaks = [];
  for (const role of ROLES) {
    for (const [m, p] of customerRoutes) {
      const res = await http(m, p, {
        token: tokens[role],
        body: m === 'POST' ? {} : undefined,
        headers: { 'idempotency-key': ID },
      });
      if (res.status !== 401) leaks.push(`${role} ${m} ${p} → ${res.status}`);
    }
  }
  s.expect(
    `jeton équipe sur ${customerRoutes.length} routes client (attendu 401 partout)`,
    [],
    leaks,
  );

  // ---- Jetons forgés ----
  const adminId = sql(
    `SELECT id FROM admin_users WHERE email='courier@demo.streetwear.local'`,
  )[0][0];
  const forged = {
    'alg=none': `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ typ: 'admin', role: 'super_admin', sub: adminId, exp: 4102444800 })).toString('base64url')}.`,
    'mauvais secret': (() => {
      const head = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ typ: 'admin', role: 'super_admin', sub: adminId, exp: 4102444800 })).toString('base64url')}`;
      return `${head}.${Buffer.from('x'.repeat(32)).toString('base64url')}`;
    })(),
    expiré: signJwt({ typ: 'admin', role: 'super_admin', sub: adminId }, -60),
    'jeton client signé typ=admin': signJwt({
      typ: 'admin',
      role: 'super_admin',
      sub: cust.userId,
    }),
    'défi TOTP (admin_challenge)': signJwt({ typ: 'admin_challenge', sub: adminId }),
  };
  const forgedRes = {};
  for (const [name, t] of Object.entries(forged))
    forgedRes[name] = (await http('GET', '/admin/users', { token: t })).status;
  s.expect(
    'jetons forgés / expirés / défi TOTP sur GET /admin/users',
    {
      'alg=none': 401,
      'mauvais secret': 401,
      expiré: 401,
      'jeton client signé typ=admin': 401,
      'défi TOTP (admin_challenge)': 401,
    },
    forgedRes,
  );
  // claim de rôle ignoré : jeton valide du livreur avec role=super_admin dans le JWT → le rôle en base prévaut
  const escal = signJwt({ typ: 'admin', role: 'super_admin', sub: adminId });
  s.expect(
    'claim role=super_admin dans un jeton valide du livreur : 403 (rôle lu en base)',
    403,
    (await http('GET', '/admin/users', { token: escal })).status,
  );
  // compte désactivé
  sql(`UPDATE admin_users SET active=false WHERE email='production@demo.streetwear.local'`);
  const deact = (await http('GET', '/admin/stock', { token: tokens.production })).status;
  sql(`UPDATE admin_users SET active=true WHERE email='production@demo.streetwear.local'`);
  s.expect('jeton d’un compte désactivé : 401 immédiat', 401, deact);

  const out = [s.finish('security-roles-1.json')];

  // ---- Transitions par rôle (le contrat dit « selon la transition ») ----
  const t = new Scenario(
    'S-ROLES-2',
    'Transitions de statut : aucun rôle ne peut franchir une transition qui ne lui est pas réservée',
  );
  const STATUSES = [
    'pending_payment',
    'payment_failed',
    'expired',
    'paid',
    'deposit_paid',
    'in_production',
    'ready',
    'shipped',
    'ready_for_pickup',
    'delivered',
    'delivery_failed',
    'returned',
    'cancelled',
    'refunded',
  ];
  const status = (id) => sql(`SELECT status FROM orders WHERE id='${id}'`)[0][0];
  const tryAll = async (orderId, role, keep) => {
    const moved = [];
    for (const to of STATUSES) {
      if (to === keep) continue;
      const r = await http('POST', `/admin/orders/${orderId}/transitions`, {
        token: tokens[role],
        body: { to, note: 'qa' },
      });
      if (r.status === 200 || r.status === 201) moved.push(`${role} → ${to} (${r.status})`);
      if (status(orderId) !== 'pending_payment') break;
    }
    return moved;
  };
  const { orderForNewCustomer, paidFlowStart } = await import('../lib/flows.mjs');
  const { sendWebhook, signedWebhook } = await import('../lib/harness.mjs');
  const o1 = await orderForNewCustomer({ colorId: 'col-blanc', size: 'M' });
  t.expect(
    'commande en attente, rôle production : aucune transition (hors cancelled non plus)',
    [],
    await tryAll(o1.orderId, 'production', null),
  );
  t.expect(
    'commande en attente, rôle logistics : aucune transition',
    [],
    await tryAll(o1.orderId, 'logistics', null),
  );
  t.expect(
    'commande en attente, rôle courier : aucune transition',
    [],
    await tryAll(o1.orderId, 'courier', null),
  );
  t.expect('commande toujours pending_payment', 'pending_payment', status(o1.orderId));
  t.expect(
    'order_manager : aucune transition sauf cancelled',
    ['order_manager → cancelled (200)'],
    await tryAll(o1.orderId, 'order_manager', null).then((m) =>
      m
        .filter((x) => !x.includes('cancelled'))
        .concat(
          status(o1.orderId) === 'cancelled'
            ? ['order_manager → cancelled (200)']
            : ['non annulée'],
        ),
    ),
  );
  const o2 = await orderForNewCustomer({ colorId: 'col-blanc', size: 'M' });
  const forbiddenForSuper = [];
  for (const to of ['paid', 'deposit_paid', 'payment_failed', 'expired']) {
    const r = await http('POST', `/admin/orders/${o2.orderId}/transitions`, {
      token: tokens.super_admin,
      body: { to, note: 'qa' },
    });
    if (r.status < 400) forbiddenForSuper.push(`super_admin → ${to} (${r.status})`);
  }
  t.expect(
    'super_admin ne peut pas déclarer payée/échouée/expirée une commande (réservé fournisseur/système)',
    [],
    forbiddenForSuper,
  );
  t.expect(
    'commande toujours pending_payment après ces tentatives',
    'pending_payment',
    status(o2.orderId),
  );
  const f = await paidFlowStart({ colorId: 'col-blanc', size: 'M' });
  await sendWebhook(signedWebhook({ ref: f.ref, paymentId: f.paymentId, amount: f.amount }));
  const skip = [];
  for (const role of ['order_manager', 'logistics', 'courier']) {
    const r = await http('POST', `/admin/orders/${f.orderId}/transitions`, {
      token: tokens[role],
      body: { to: 'in_production', note: 'qa' },
    });
    if (r.status < 400) skip.push(`${role} → in_production (${r.status})`);
  }
  const rp = await http('POST', `/admin/orders/${f.orderId}/transitions`, {
    token: tokens.production,
    body: { to: 'in_production', note: 'qa' },
  });
  t.expect('paid → in_production par order_manager/logistics/courier refusé', [], skip);
  t.expect(
    'paid → in_production par production sans opérateur affecté refusé',
    true,
    rp.status >= 400,
  );
  t.expect('commande toujours paid', 'paid', status(f.orderId));
  out.push(t.finish('security-roles-2.json'));
  return out;
}
await runIfMain(import.meta.url, run);
