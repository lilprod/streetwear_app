// Lance tous les scénarios de cohérence contre l'API compilée démarrée (bash qa/stack.sh start). Code de sortie 1 si un échec.
import { run as stock } from './01-stock.mjs';
import { run as slots } from './02-slots.mjs';
import { run as webhooks } from './03-webhooks.mjs';
import { run as payments } from './04-double-payment.mjs';
import { run as expiry } from './05-expiry.mjs';

const results = [];
for (const r of [stock, slots, webhooks, payments, expiry]) results.push(...(await r()));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scénarios OK`);
for (const f of failed)
  console.log(
    `ÉCHEC ${f.id} : ${f.checks
      .filter((c) => !c.ok)
      .map((c) => c.label)
      .join(' ; ')}`,
  );
process.exit(failed.length ? 1 : 0);
