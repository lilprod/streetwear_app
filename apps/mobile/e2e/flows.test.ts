/** @jest-environment node */
/**
 * Static checks of the Maestro flows (no device here): YAML syntax, known commands, existing files,
 * and every `id:` selector must match a testID declared in the app source.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';

const E2E = __dirname;
const SRC = resolve(E2E, '../src');
const APP = resolve(E2E, '../app');

const COMMANDS = new Set([
  'launchApp',
  'tapOn',
  'inputText',
  'hideKeyboard',
  'extendedWaitUntil',
  'assertVisible',
  'assertNotVisible',
  'scrollUntilVisible',
  'runFlow',
  'runScript',
  'repeat',
  'back',
  'waitForAnimationToEnd',
]);

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const yamlFiles = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(dir, f));

const flows = yamlFiles(E2E);
const subflows = yamlFiles(join(E2E, 'subflows'));

const toRegex = (id: string): RegExp =>
  new RegExp(
    `^${id
      .split(/\$\{[^}]+\}/)
      .map((part) => part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'))
      .join('.+')}$`,
  );

function declaredIds(): RegExp[] {
  const sources = [...walk(SRC), ...walk(APP)].filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  const out: RegExp[] = [];
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/testID(?:=|:\s*)(?:"([^"]+)"|'([^']+)'|\{`([^`]+)`\})/g)) {
      const id = (m[1] ?? m[2] ?? m[3]) as string;
      out.push(toRegex(id));
      if (id === 'quantity') ['-inc', '-dec', '-value'].forEach((s) => out.push(toRegex(id + s)));
    }
  }
  return out;
}

type Step = string | { [command: string]: unknown };

function commandsOf(file: string): Step[] {
  const docs = parseAllDocuments(readFileSync(file, 'utf8'));
  expect(docs.map((d) => d.errors)).toEqual(docs.map(() => []));
  expect(docs).toHaveLength(2);
  const body = docs[1]?.toJS() as Step[];
  expect(Array.isArray(body)).toBe(true);
  return body;
}

function flatten(steps: Step[]): Step[] {
  return steps.flatMap((s) => {
    const inner =
      typeof s === 'string' ? undefined : (s.repeat as { commands?: Step[] } | undefined)?.commands;
    return inner ? [s, ...flatten(inner)] : [s];
  });
}

describe('Maestro flows', () => {
  it('provides the five journeys of SP12', () => {
    expect(flows.map((f) => f.split('/').pop())).toEqual([
      '01-premier-design-tmoney.yaml',
      '02-commande-groupe-retrait.yaml',
      '03-livraison-acompte-cod.yaml',
      '04-suivi-recommande.yaml',
      '05-connexion-code-faux-puis-bon.yaml',
    ]);
  });

  it('targets the Android package declared in app.json', () => {
    const pkg = (
      JSON.parse(readFileSync(resolve(E2E, '../app.json'), 'utf8')) as {
        expo: { android: { package: string } };
      }
    ).expo.android.package;
    for (const f of [...flows, ...subflows]) {
      const header = parseAllDocuments(readFileSync(f, 'utf8'))[0]?.toJS() as { appId: string };
      expect(header.appId).toBe(pkg);
    }
  });

  const ids = declaredIds();

  it.each([...flows, ...subflows].map((f) => [f.slice(E2E.length + 1), f]))(
    '%s uses known commands, existing files and declared testIDs',
    (_name, file) => {
      for (const step of flatten(commandsOf(file))) {
        const cmd = typeof step === 'string' ? step : (Object.keys(step)[0] as string);
        expect({ cmd, known: COMMANDS.has(cmd) }).toEqual({ cmd, known: true });
        const arg =
          typeof step === 'string' ? null : (step[cmd] as Record<string, unknown> | string | null);
        const selectors: unknown[] = [];
        if (arg && typeof arg === 'object') {
          selectors.push(
            arg,
            (arg as { visible?: unknown }).visible,
            (arg as { element?: unknown }).element,
          );
        }
        for (const sel of selectors) {
          const id = sel && typeof sel === 'object' ? (sel as { id?: unknown }).id : undefined;
          if (typeof id === 'string') {
            expect({ id, declared: ids.some((r) => r.test(id)) }).toEqual({ id, declared: true });
          }
        }
        if ((cmd === 'runFlow' || cmd === 'runScript') && arg && typeof arg === 'object') {
          const target = (arg as { file?: string }).file;
          expect(typeof target).toBe('string');
          expect(existsSync(resolve(dirname(file), target as string))).toBe(true);
        }
      }
    },
  );
});
