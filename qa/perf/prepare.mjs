// Prépare les données de la charge : N clients avec un panier prêt, un créneau et un stock très grands.
// Usage : node qa/perf/prepare.mjs [N=1200]  → qa/results/logs/perf-fixtures.json (jetons valides 2 h, non versionné)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESIGN,
  QA_DIR,
  customers,
  fillCart,
  http,
  makeSlot,
  setStock,
  sqlOne,
  STORE_ID,
} from '../lib/harness.mjs';

const N = Number(process.argv[2] ?? 1200);
const POOL = 24;

setStock('col-noir', 'M', 10_000_000, 0);
const slotId = makeSlot(10_000_000);
const storeId = STORE_ID();
const zone = sqlOne(`SELECT id FROM delivery_zones WHERE active ORDER BY id LIMIT 1`);
const cs = await customers(N);
// Jetons de 2 h (les jetons de production durent 15 min)
const { signJwt } = await import('../lib/harness.mjs');
for (const c of cs) c.token = signJwt({ typ: 'customer', sub: c.userId }, 7200);

let done = 0;
const t0 = Date.now();
async function worker(list) {
  for (const c of list) {
    await fillCart(c.token, { colorId: 'col-noir', size: 'M', qty: 1 });
    done += 1;
    if (done % 200 === 0)
      console.log(`  ${done}/${N} paniers prêts (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
await Promise.all(
  Array.from({ length: POOL }, (_, i) => worker(cs.filter((_, k) => k % POOL === i))),
);

const slotDate = sqlOne(
  `SELECT to_char(starts_at, 'YYYY-MM-DD') FROM pickup_slots WHERE id='${slotId}'`,
);
const zonePoly = http('GET', '/delivery/zones/resolve?lat=6.1319&lng=1.2228', {});
const resolve = await zonePoly;
mkdirSync(join(QA_DIR, 'results/logs'), { recursive: true });
writeFileSync(
  join(QA_DIR, 'results/logs/perf-fixtures.json'),
  JSON.stringify({
    tokens: cs.map((c) => c.token),
    storeId,
    slotId,
    slotDate,
    zoneId: zone,
    resolveStatus: resolve.status,
    design: DESIGN(),
  }),
);
console.log(
  `prêt : ${N} clients, créneau ${slotId} (${slotDate}), résolution de zone ${resolve.status}, ${Math.round((Date.now() - t0) / 1000)} s`,
);
