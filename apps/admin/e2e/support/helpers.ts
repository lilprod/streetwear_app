import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { API_URL, DEMO_PASSWORD, DEMO_TOTP_SECRET, SMS_OUTBOX, demoEmail } from './env';
import { totp } from './totp';

export type Role = 'super-admin' | 'order-manager' | 'production' | 'logistics' | 'courier';

const authCalls: number[] = [];
const AUTH_LIMIT = 18; // the API allows 20 requests/min on /admin/auth/*, per IP

/** Reserves `n` calls on /admin/auth/* and waits when the API's login rate limit would be exceeded. */
export async function authBudget(n: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (authCalls.length && now - (authCalls[0] as number) > 61_000) authCalls.shift();
    if (authCalls.length + n <= AUTH_LIMIT) break;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  for (let i = 0; i < n; i += 1) authCalls.push(Date.now());
}

/** Signs in through the login screen (password then TOTP). */
export async function signIn(page: Page, role: Role): Promise<void> {
  await authBudget(2);
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(demoEmail(role));
  await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const totpHeading = page.getByRole('heading', { name: 'Vérification en deux étapes' });
  const banner = page.getByRole('banner');
  await expect(totpHeading.or(banner)).toBeVisible();
  if (await totpHeading.isVisible()) {
    await page.getByLabel('Code à 6 chiffres').fill(totp(DEMO_TOTP_SECRET));
    await page.getByRole('button', { name: 'Valider' }).click();
  }
  await expect(banner).toBeVisible();
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Direct API access, used only to locate fixtures (never to perform the journey under test). */
const tokens = new Map<Role, { token: string; at: number }>();

export async function apiToken(role: Role): Promise<string> {
  const cached = tokens.get(role);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.token;
  await authBudget(2);
  const login = await post<{ challenge: string }>('/admin/auth/login', {
    email: demoEmail(role),
    password: DEMO_PASSWORD,
  });
  const session = await post<{ accessToken: string }>('/admin/auth/totp', {
    challenge: login.challenge,
    code: totp(DEMO_TOTP_SECRET),
  });
  tokens.set(role, { token: session.accessToken, at: Date.now() });
  return session.accessToken;
}

export interface OrderRef {
  id: string;
  number: string;
  status: string;
  receptionType: string;
  customer: { phone?: string };
}

export async function findOrders(
  filter: { status: string; reception?: 'home' | 'pickup' },
  token?: string,
): Promise<OrderRef[]> {
  const t = token ?? (await apiToken('super-admin'));
  const q = new URLSearchParams({ status: filter.status, limit: '100' });
  const res = await fetch(`${API_URL}/admin/orders?${q}`, {
    headers: { authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error(`GET /admin/orders → ${res.status}`);
  const { items } = (await res.json()) as { items: OrderRef[] };
  return filter.reception ? items.filter((o) => o.receptionType === filter.reception) : items;
}

export interface OrderDetail {
  status: string;
  delivery: { status: string; courier: { id: string; name: string } | null } | null;
  production: { items: { itemId: string; front: boolean; back: boolean }[] } | null;
  customer: { phone: string };
}

export async function orderDetail(id: string): Promise<OrderDetail> {
  const t = await apiToken('super-admin');
  const res = await fetch(`${API_URL}/admin/orders/${id}`, {
    headers: { authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error(`GET /admin/orders/${id} → ${res.status}`);
  return (await res.json()) as OrderDetail;
}

export const orderStatus = async (id: string): Promise<string> => (await orderDetail(id)).status;

/** Latest 6-digit code sent by SMS to the phone (outbox file written by the fake SMS provider). */
export function lastSmsCode(phone: string, after = 0): string | null {
  let raw = '';
  try {
    raw = readFileSync(SMS_OUTBOX, 'utf8');
  } catch {
    return null;
  }
  const lines = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { phone: string; text: string; at: string });
  const mine = lines.filter((l) => l.phone === phone && Date.parse(l.at) >= after);
  for (const l of mine.reverse()) {
    const m = /Code de (?:remise|retrait) (\d{6})/.exec(l.text);
    if (m) return m[1] as string;
  }
  return null;
}
