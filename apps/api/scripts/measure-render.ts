import { createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Zone } from '@streetwear/shared';
import { renderZone } from '../src/modules/production/render/render-zone';

/** Mesure isolée (processus dédié) d'un rendu A3 : temps et pic mémoire. Sortie : une ligne JSON. */
function bigPattern(): Buffer {
  const size = 4800;
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
    ctx.fillRect((i * 97) % size, (i * 193) % size, 600, 600);
  }
  return c.toBuffer('image/png');
}

async function main(): Promise<void> {
  const font = readFileSync(join(__dirname, '../test/fixtures/DejaVuSans-Bold.ttf'));
  const pattern = bigPattern();
  const zone: Zone = {
    layers: [
      {
        type: 'pattern',
        id: 'a',
        patternId: 'p',
        x: 0,
        y: 0,
        width: 297,
        height: 420,
        rotation: 0,
        repeat: 'none',
        tileScale: 1,
      },
      {
        type: 'text',
        id: 'b',
        text: 'LOMÉ 228',
        fontId: 'f',
        colorHex: '#FFFFFF',
        sizeMm: 40,
        x: 148.5,
        y: 330,
        rotation: 0,
        align: 'center',
      },
    ],
  };
  const baseline = process.memoryUsage().rss;
  let peak = baseline;
  const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 10);
  const t0 = process.hrtime.bigint();
  const png = await renderZone(zone, { patterns: { p: pattern }, fonts: { f: font } });
  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  const mb = (n: number) => Math.round(n / 2 ** 20);
  console.log(
    JSON.stringify({
      seconds: Number(seconds.toFixed(2)),
      peakRssMb: mb(peak),
      baselineRssMb: mb(baseline),
      pngMb: Number((png.length / 2 ** 20).toFixed(2)),
    }),
  );
}

void main();
