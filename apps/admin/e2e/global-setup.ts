import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_PORT,
  API_URL,
  DATABASE_URL,
  REDIS_URL,
  RUN_DIR,
  SMS_OUTBOX,
  WEB_PORT,
  WEB_URL,
} from './support/env';

const here = dirname(fileURLToPath(import.meta.url));
const adminDir = resolve(here, '..');
const apiDir = resolve(adminDir, '../api');

const children: ChildProcess[] = [];

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, input?: string): void {
  const r = spawnSync(cmd, args, { cwd: apiDir, env, input, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} a échoué :\n${r.stdout}\n${r.stderr}`.slice(0, 4000));
  }
}

/** Minimal RESP client: FLUSHDB on the dedicated Redis database, no extra dependency. */
function flushRedis(url: string): Promise<void> {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? u.pathname.slice(1) : '0';
  const cmd = (...a: string[]) =>
    `*${a.length}\r\n${a.map((x) => `$${Buffer.byteLength(x)}\r\n${x}\r\n`).join('')}`;
  return new Promise((ok, ko) => {
    const s = createConnection({ host: u.hostname, port: Number(u.port || 6379) });
    let out = '';
    s.on('error', ko);
    s.on('data', (d) => {
      out += d.toString();
      if ((out.match(/\r\n/g) ?? []).length >= (u.password ? 3 : 2)) {
        s.end();
        if (out.includes('-ERR')) ko(new Error(`Redis : ${out}`));
        else ok();
      }
    });
    if (u.password) s.write(cmd('AUTH', decodeURIComponent(u.password)));
    s.write(cmd('SELECT', db) + cmd('FLUSHDB'));
  });
}

async function waitFor(url: string, label: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} injoignable sur ${url} (voir ${RUN_DIR}).`);
}

function start(name: string, cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const fd = openSync(join(RUN_DIR, `${name}.log`), 'w');
  const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', fd, fd], detached: true });
  closeSync(fd);
  children.push(child);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const dbName = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e|sp12|test/.test(dbName)) {
    throw new Error(`Base « ${dbName} » refusée : le nom doit contenir e2e, sp12 ou test.`);
  }
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(RUN_DIR, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    DATABASE_URL,
    REDIS_URL,
    JWT_SECRET: 'e2e-only-jwt-secret-e2e-only-jwt-secret-00',
    FAKE_PAYMENT_WEBHOOK_SECRET: 'e2e-only-fake-payment-secret-0000000000',
    RATE_LIMIT_PER_MINUTE: '5000',
    PAYMENT_PROVIDER: 'fake',
    PUSH_PROVIDER: 'fake',
    EMAIL_PROVIDER: 'fake',
    ASSET_CACHE_DIR: join(RUN_DIR, 'assets'),
    STORAGE_LOCAL_DIR: join(RUN_DIR, 'storage'),
    TEST_SMS_OUTBOX_FILE: SMS_OUTBOX,
    LOG_LEVEL: 'warn',
  };

  await flushRedis(REDIS_URL);
  run(
    'pnpm',
    ['exec', 'prisma', 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'],
    env,
    'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
  );
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], env);
  run('node', ['dist/seed/demo.js'], env);

  // Demo patterns and fonts are not hosted anywhere: pre-fill the render asset cache
  // (key = sha256 of the publicId) with a local SVG and the DejaVu test font.
  const font = readFileSync(join(apiDir, 'test/fixtures/DejaVuSans-Bold.ttf'));
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
      '<rect width="400" height="400" fill="#c0392b"/><circle cx="200" cy="200" r="120" fill="#f1c40f"/>' +
      '<path d="M0 400L200 80L400 400Z" fill="#1e8449"/></svg>',
  );
  mkdirSync(env.ASSET_CACHE_DIR as string, { recursive: true });
  const cache = (publicId: string, data: Buffer) =>
    writeFileSync(
      join(env.ASSET_CACHE_DIR as string, createHash('sha256').update(publicId).digest('hex')),
      data,
    );

  // Offline catalogue read: the seeded ids are stable (see apps/api/src/catalog/seed.ts).
  const ids = spawnSync(
    'node',
    [
      '-e',
      `const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();` +
        `Promise.all([p.pattern.findMany({select:{imagePublicId:true}}),p.font.findMany({select:{filePublicId:true}})])` +
        `.then(([a,b])=>console.log(JSON.stringify({p:a.map(x=>x.imagePublicId),f:b.map(x=>x.filePublicId)})))` +
        `.finally(()=>p.$disconnect())`,
    ],
    { cwd: apiDir, env, encoding: 'utf8' },
  );
  if (ids.status !== 0) throw new Error(`Lecture du catalogue impossible : ${ids.stderr}`);
  const { p, f } = JSON.parse(ids.stdout.trim().split('\n').pop() as string) as {
    p: string[];
    f: string[];
  };
  p.forEach((id) => cache(id, svg));
  f.forEach((id) => cache(id, font));

  start('api', 'node', ['dist/main.js'], env, apiDir);
  start('worker', 'node', ['dist/worker.js'], env, apiDir);
  start(
    'web',
    'pnpm',
    ['exec', 'vite', '--port', String(WEB_PORT), '--strictPort'],
    { ...env, API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    adminDir,
  );
  await waitFor(`${API_URL}/health`, 'API');
  await waitFor(WEB_URL, 'Vite');
  await waitFor(`${WEB_URL}/v1/health`, 'Proxy Vite vers API');

  return async () => {
    for (const c of children) {
      try {
        process.kill(-(c.pid as number), 'SIGTERM');
      } catch {
        // already stopped
      }
    }
  };
}
