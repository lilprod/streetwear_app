// S-LOGS : recherche de données personnelles et de secrets dans les journaux de l'API et du worker (qa/results/logs/*.log)
// produits pendant les scénarios (coherence, sécurité, performance). À lancer APRÈS eux, avant d'arrêter / purger les journaux.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV, QA_DIR, Scenario } from '../lib/harness.mjs';
import { runIfMain } from '../lib/flows.mjs';

const LOGS = join(QA_DIR, 'results/logs');

const PATTERNS = {
  'téléphone E.164 complet (+228 + 8 chiffres)': /\+228\s?\d{8}\b/g,
  'téléphone local 8 chiffres (9x…, 7x…)': /(?<![0-9a-fA-F.-])[79]\d{7}(?![0-9a-fA-F.-])/g,
  'code OTP / retrait / remise (« code » suivi de 4 à 8 chiffres)':
    /code[^\n"]{0,20}?(?<![\d.])\d{4,8}(?![\d.])/gi,
  'jeton JWT (eyJ…)': /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  'en-tête Authorization en clair':
    /authorization["']?\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  'e-mail d’un client (hors comptes démo équipe)':
    /[\w.+-]+@(?!demo\.streetwear\.local|streetwear\.test)[\w-]+\.[a-z]{2,}/gi,
  'coordonnées GPS dans une URL (lat=…&lng=…)': /lat=-?\d+\.\d+&(amp;)?lng=-?\d+\.\d+/gi,
  'mot de passe démo': /DemoLocal-2026!/g,
  'secret TOTP démo': /JBSWY3DPEHPK3PXP/g,
};
const SECRET_VALUES = [
  ENV.JWT_SECRET,
  ENV.FAKE_PAYMENT_WEBHOOK_SECRET,
  ENV.NOTIFICATION_CODE_KEY,
].filter(Boolean);

export async function run() {
  const s = new Scenario(
    'S-LOGS-1',
    'Données personnelles et secrets dans les journaux API et worker',
  );
  const files = readdirSync(LOGS).filter((f) => f.endsWith('.log'));
  let lines = 0;
  const hits = {};
  for (const f of files) {
    const text = readFileSync(join(LOGS, f), 'utf8');
    lines += text.split('\n').length;
    for (const [label, re] of Object.entries(PATTERNS)) {
      const m = text.match(re) ?? [];
      if (m.length)
        (hits[label] ??= []).push(
          ...m.map((x) => `${f}: ${x.length > 60 ? `${x.slice(0, 60)}…` : x}`),
        );
    }
    for (const secret of SECRET_VALUES)
      if (text.includes(secret)) (hits['valeur d’un secret du .env'] ??= []).push(f);
  }
  s.note(`${files.length} fichiers (${files.join(', ')}), ${lines} lignes analysées`);
  for (const label of Object.keys(PATTERNS)) {
    const found = hits[label] ?? [];
    s.expect(`${label} : occurrences`, 0, found.length);
    if (found.length)
      s.note(`${label} — exemples : ${[...new Set(found)].slice(0, 3).join(' | ')}`);
  }
  s.expect(
    'valeur d’un secret du .env : occurrences',
    0,
    (hits['valeur d’un secret du .env'] ?? []).length,
  );

  // Données en base censées ne jamais contenir de code (contrat SP07)
  const leakedPayload = s.control(
    'notifications.payload contenant un code à 4-8 chiffres',
    `SELECT count(*) FROM notifications WHERE payload::text ~ '(?i)code[^,}]*[0-9]{4,8}'`,
  );
  s.expect('notifications.payload sans code', '0', leakedPayload[0][0]);
  const rawWebhook = s.control(
    'payment_events.raw_body contenant un numéro E.164 complet',
    `SELECT count(*) FROM payment_events WHERE raw_body ~ '\\+228[0-9]{8}'`,
  );
  s.expect('payment_events sans numéro complet', '0', rawWebhook[0][0]);
  return [s.finish('security-logs-1.json')];
}
await runIfMain(import.meta.url, run);
