import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3107);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5187);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}/v1`;

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://streetwear:streetwear@localhost:5432/streetwear_e2e';
export const REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/9';

/** Working directory of one run: logs, asset cache, local storage, SMS outbox. */
export const RUN_DIR = process.env.E2E_RUN_DIR ?? join(tmpdir(), 'streetwear-e2e');
export const SMS_OUTBOX = join(RUN_DIR, 'sms.jsonl');

export const DEMO_PASSWORD = 'DemoLocal-2026!';
export const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
export const demoEmail = (role: string): string => `${role}@demo.streetwear.local`;
