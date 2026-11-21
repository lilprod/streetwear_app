// S-HDR : en-têtes de sécurité, CORS absent, fuite d'informations, taille de corps.
// HSTS (Strict-Transport-Security), TLS et CSP du back-office relèvent du reverse proxy : l'API est servie en HTTP derrière lui ;
// ce script ne les exige donc pas de l'API et le rapport les liste comme « à vérifier sur la recette réelle ».
import { Scenario, http } from '../lib/harness.mjs';
import { runIfMain } from '../lib/flows.mjs';

const ORIGIN = 'https://evil.example';

export async function run() {
  const out = [];
  const s1 = new Scenario(
    'S-HDR-1',
    'En-têtes de sécurité portés par l’API (helmet ou équivalent)',
  );
  const probes = [
    ['GET', '/health'],
    ['GET', '/catalog/colors'],
    ['POST', '/admin/auth/login'],
    ['GET', '/admin/users'],
  ];
  for (const [m, p] of probes) {
    const r = await http(m, p, { body: m === 'POST' ? {} : undefined });
    const h = r.headers;
    const tag = `${m} ${p} (${r.status})`;
    s1.expect(`${tag} : X-Content-Type-Options`, 'nosniff', h.get('x-content-type-options'));
    s1.expectTrue(
      `${tag} : protection contre l’inclusion en cadre (X-Frame-Options ou CSP frame-ancestors)`,
      h.get('x-frame-options') || /frame-ancestors/.test(h.get('content-security-policy') ?? ''),
      `x-frame-options=${h.get('x-frame-options')}`,
    );
    s1.expectTrue(`${tag} : Referrer-Policy`, Boolean(h.get('referrer-policy')), 'absent');
    s1.expect(`${tag} : X-Powered-By absent`, null, h.get('x-powered-by'));
  }
  const err = await http('GET', '/admin/users', { token: 'x' });
  s1.expectTrue(
    'réponse d’erreur : Cache-Control no-store/private (pas de mise en cache d’une réponse authentifiée)',
    /no-store|private/.test(err.headers.get('cache-control') ?? ''),
    `cache-control=${err.headers.get('cache-control')}`,
  );
  s1.note(
    'Strict-Transport-Security : à poser par le reverse proxy (TLS y est terminé) ; non vérifiable contre l’API en HTTP local.',
  );
  out.push(s1.finish('security-hdr-1.json'));

  const s2 = new Scenario('S-HDR-2', 'CORS absent (décision du lead : même origine)');
  {
    const get = await http('GET', '/catalog/colors', { headers: { origin: ORIGIN } });
    s2.expect(
      'GET avec Origin étrangère : pas de Access-Control-Allow-Origin',
      null,
      get.headers.get('access-control-allow-origin'),
    );
    const pre = await http('OPTIONS', '/admin/orders', {
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    s2.expect(
      'préflight OPTIONS : pas de Access-Control-Allow-Origin',
      null,
      pre.headers.get('access-control-allow-origin'),
    );
    s2.expect(
      'préflight OPTIONS : pas de Access-Control-Allow-Methods',
      null,
      pre.headers.get('access-control-allow-methods'),
    );
    const wild = await http('GET', '/health', { headers: { origin: 'null' } });
    s2.expect(
      'Origin: null : pas d’autorisation',
      null,
      wild.headers.get('access-control-allow-origin'),
    );
  }
  out.push(s2.finish('security-hdr-2.json'));

  const s3 = new Scenario('S-HDR-3', 'Fuites d’informations et limites de corps');
  {
    const big = await http('POST', '/designs', {
      token: 'x',
      raw: JSON.stringify({ pad: 'a'.repeat(1_200_000) }),
      headers: { 'content-type': 'application/json' },
    });
    s3.expect('corps de 1,2 Mo : 413 (limite 1 Mo)', 413, big.status);
    const bad = await http('POST', '/auth/otp/request', {
      raw: '{pas du json',
      headers: { 'content-type': 'application/json' },
    });
    s3.expect(
      'JSON invalide : 400 sans trace de pile',
      true,
      bad.status === 400 && !/at .*\.js|node_modules|stack/i.test(bad.text),
    );
    const e404 = await http('GET', '/n-existe-pas');
    s3.expect('route inconnue : 404 au format { error }', 'NOT_FOUND', e404.body?.error?.code);
    const e500 = await http('GET', '/delivery/zones/resolve?lat=abc&lng=1');
    s3.expect(
      'paramètre invalide : pas de trace SQL / Prisma dans la réponse',
      false,
      /prisma|SELECT|node_modules/i.test(e500.text),
    );
    const docs = await http('GET', '/docs');
    s3.note(
      `/v1/docs (Swagger UI) répond ${docs.status} sans authentification et sans condition d’environnement : à désactiver ou protéger en production (mineure).`,
    );
    s3.expectTrue(
      '/v1/docs désactivable en production',
      process.env.NODE_ENV === 'production' ? docs.status === 404 : true,
      `status ${docs.status}`,
    );
  }
  out.push(s3.finish('security-hdr-3.json'));
  return out;
}
await runIfMain(import.meta.url, run);
