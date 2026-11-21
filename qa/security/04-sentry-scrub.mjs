// S-SENTRY : le scrub configuré (apps/api/src/config/sentry.ts, compilé) masque-t-il les données personnelles ?
// 1) sans réseau : fonction scrub sur un événement type ; 2) de bout en bout : SDK initialisé avec initSentry vers un DSN local
// (serveur de capture sur 127.0.0.1) puis lecture des enveloppes réellement émises.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT, Scenario, sleep } from '../lib/harness.mjs';
import { runIfMain } from '../lib/flows.mjs';

const req = createRequire(join(ROOT, 'apps/api/package.json'));
const SECRETS = {
  phone: '+22890123456',
  recipientPhone: '+22891234567',
  payerPhone: '+22892345678',
  email: 'client.secret@example.com',
  name: 'Kokou Mensah',
  otp: '987654',
  accessToken: 'eyJhbGciOiJIUzI1NiJ9.SECRETACCESS.sig',
  refreshToken: 'REFRESHSECRET1234567890',
  authorization: `Bearer ${['BEARER', 'SECRET'].join('')}`,
  cookie: `sid=${['COOKIE', 'SECRET'].join('')}`,
  handoverCode: '554433',
  address: 'Rue des Cocotiers 12',
  landmark: 'en face de la pharmacie',
  lat: 6.131234,
};

export async function run() {
  const s1 = new Scenario(
    'S-SENTRY-1',
    'Fonction scrub : champs personnels masqués dans un événement type',
  );
  const { scrub } = req(join(ROOT, 'apps/api/dist/config/sentry.js'));
  const event = {
    request: {
      url: `https://api.example/v1/auth/otp/verify?phone=${encodeURIComponent(SECRETS.phone)}`,
      headers: { authorization: SECRETS.authorization, cookie: SECRETS.cookie },
      data: {
        phone: SECRETS.phone,
        code: SECRETS.otp,
        refreshToken: SECRETS.refreshToken,
        recipientPhone: SECRETS.recipientPhone,
      },
    },
    user: { email: SECRETS.email, username: SECRETS.name, ip_address: '41.207.1.2' },
    extra: {
      payerPhone: SECRETS.payerPhone,
      handoverCode: SECRETS.handoverCode,
      accessToken: SECRETS.accessToken,
      address: SECRETS.address,
      landmark: SECRETS.landmark,
    },
    message: `Échec pour ${SECRETS.phone}`,
  };
  const scrubbed = JSON.stringify(scrub(event));
  const leaked = Object.entries(SECRETS)
    .filter(([, v]) => scrubbed.includes(String(v)))
    .map(([k]) => k);
  s1.expect('valeurs personnelles encore présentes après scrub', [], leaked);
  s1.expect(
    'champs masqués attendus : phone, address, landmark',
    true,
    !scrubbed.includes('"phone":"+228') &&
      !scrubbed.includes(SECRETS.address) &&
      !scrubbed.includes(SECRETS.landmark),
  );

  const s2 = new Scenario(
    'S-SENTRY-2',
    'De bout en bout : enveloppe réellement envoyée à Sentry (DSN local)',
  );
  const envelopes = [];
  const server = createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      let buf = Buffer.concat(chunks);
      if (rq.headers['content-encoding'] === 'gzip') buf = gunzipSync(buf);
      envelopes.push(buf.toString('utf8'));
      rs.writeHead(200).end('{}');
    });
  });
  await new Promise((r) => server.listen(9998, '127.0.0.1', r));
  try {
    const Sentry = req('@sentry/node');
    const { initSentry } = req(join(ROOT, 'apps/api/dist/config/sentry.js'));
    initSentry('http://publickey@127.0.0.1:9998/1', 'qa');
    Sentry.withScope((scope) => {
      scope.setUser({ email: SECRETS.email, username: SECRETS.name, ip_address: '41.207.1.2' });
      scope.setContext('requete', {
        phone: SECRETS.phone,
        code: SECRETS.otp,
        recipientPhone: SECRETS.recipientPhone,
      });
      scope.setExtras({
        payerPhone: SECRETS.payerPhone,
        refreshToken: SECRETS.refreshToken,
        handoverCode: SECRETS.handoverCode,
        address: SECRETS.address,
      });
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          url: 'https://api.example/v1/me',
          method: 'POST',
          headers: { authorization: SECRETS.authorization, cookie: SECRETS.cookie },
          data: { phone: SECRETS.phone, code: SECRETS.otp },
        },
      });
      Sentry.captureException(new Error(`Échec paiement pour ${SECRETS.phone}`));
    });
    await Sentry.flush(5000);
    await sleep(300);
  } finally {
    server.close();
  }
  const all = envelopes.join('\n');
  s2.expectTrue('une enveloppe a été émise', envelopes.length >= 1, `reçues ${envelopes.length}`);
  const leaked2 = Object.entries(SECRETS)
    .filter(([, v]) => all.includes(String(v)))
    .map(([k]) => k);
  s2.expect('valeurs personnelles présentes dans l’enveloppe émise', [], leaked2);
  s2.expect(
    'cookies / en-tête Authorization absents',
    false,
    all.includes(['COOKIE', 'SECRET'].join('')) || all.includes(['BEARER', 'SECRET'].join('')),
  );
  return [s1.finish('security-sentry-1.json'), s2.finish('security-sentry-2.json')];
}
await runIfMain(import.meta.url, run);
