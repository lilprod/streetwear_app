// Lance les contrôles de sécurité. L'API :3100 doit tourner (bash qa/stack.sh start) ; 02-rate-limits démarre sa propre API sur :3101.
// Les journaux (05) doivent être lus après les autres scénarios, y compris ceux de cohérence et de performance.
// SKIP_RATE=1 saute 02-rate-limits (≈ 6 min).
import { run as roles } from './01-roles-matrix.mjs';
import { run as rate } from './02-rate-limits.mjs';
import { run as headers } from './03-headers-cors.mjs';
import { run as sentry } from './04-sentry-scrub.mjs';
import { run as logs } from './05-logs-pii.mjs';

const steps = [roles, headers, sentry, ...(process.env.SKIP_RATE === '1' ? [] : [rate]), logs];
const results = [];
for (const r of steps) results.push(...(await r()));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} contrôles OK`);
for (const f of failed)
  console.log(
    `ÉCHEC ${f.id} : ${f.checks
      .filter((c) => !c.ok)
      .map((c) => c.label)
      .join(' ; ')}`,
  );
process.exit(failed.length ? 1 : 0);
