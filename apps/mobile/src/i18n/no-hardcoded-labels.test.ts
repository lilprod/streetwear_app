import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '.expo') return [];
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx$/.test(full) && !/\.test\./.test(full) ? [full] : [];
  });
}

describe('i18n', () => {
  const sources = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'app'))];

  it('keeps visible labels out of components', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const code = readFileSync(file, 'utf8');
      const jsxText = /(?<![=-])>\s*[A-Za-zÀ-ÿ][^<>{}=;()]{2,}</g;
      const attrs = /(accessibilityLabel|placeholder|title|label)=["'][^"'{]*[A-Za-zÀ-ÿ]{3,}/g;
      for (const re of [jsxText, attrs]) {
        for (const m of code.matchAll(re)) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
