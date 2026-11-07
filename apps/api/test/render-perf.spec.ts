import { def } from './def';
import { execFileSync } from 'node:child_process';

describe('renderZone performance (SP08)', () => {
  it('renders a full A3 zone (4800 px pattern + text) in under 10 s and under 512 MB RSS', () => {
    const out = execFileSync('pnpm', ['exec', 'tsx', 'scripts/measure-render.ts'], {
      cwd: `${__dirname}/..`,
      encoding: 'utf8',
      timeout: 120_000,
    });
    const r = JSON.parse(def(out.trim().split('\n').pop())) as {
      seconds: number;
      peakRssMb: number;
      baselineRssMb: number;
    };
    process.stdout.write(`A3 render: ${JSON.stringify(r)}\n`);
    expect(r.seconds).toBeLessThan(10);
    expect(r.peakRssMb).toBeLessThan(512);
  }, 150_000);
});
