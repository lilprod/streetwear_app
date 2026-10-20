import { http, HttpResponse } from 'msw';
import {
  FIXTURE_ORDERS,
  ADMIN_ROLES,
  AdminLoginInputSchema,
  AdminTotpInputSchema,
  type AdminRole,
  type ApiError,
  type StatsSummary,
} from '@streetwear/shared';

export const DEMO_PASSWORD = 'demo-password-12';
export const DEMO_TOTP_CODE = '123456';
export const DEMO_ENROLL_SECRET = 'JBSWY3DPEHPK3PXP';

export type DemoAccount = { email: string; role: AdminRole; enrolled: boolean };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'admin@streetwear.test', role: 'super_admin', enrolled: true },
  { email: 'commandes@streetwear.test', role: 'order_manager', enrolled: true },
  { email: 'production@streetwear.test', role: 'production', enrolled: true },
  { email: 'logistique@streetwear.test', role: 'logistics', enrolled: true },
  { email: 'livreur@streetwear.test', role: 'courier', enrolled: true },
  { email: 'nouveau@streetwear.test', role: 'order_manager', enrolled: false },
];

const b64url = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function fakeJwt(account: DemoAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const payload = b64url({
    sub: `demo-${account.role}`,
    typ: 'admin',
    role: account.role,
    email: account.email,
    iat: nowSec,
    exp: nowSec + 8 * 3600,
  });
  return `${header}.${payload}.demo`;
}

const tokens = (a: DemoAccount) => ({
  accessToken: fakeJwt(a),
  refreshToken: `demo-refresh-${a.role}`,
});

const err = (status: number, code: ApiError['error']['code'], message: string) =>
  HttpResponse.json({ error: { code, message } } satisfies ApiError, { status });

const challenges = new Map<string, DemoAccount>();

export function roleFromAuthHeader(header: string | null): AdminRole | null {
  const token = header?.replace(/^Bearer /, '');
  try {
    const part = token?.split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string;
    };
    return ADMIN_ROLES.find((r) => r === claims.role) ?? null;
  } catch {
    return null;
  }
}

export const handlers = [
  http.post('*/v1/admin/auth/login', async ({ request }) => {
    const parsed = AdminLoginInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return err(400, 'VALIDATION_FAILED', 'Les informations saisies sont invalides.');
    const account = DEMO_ACCOUNTS.find((a) => a.email === parsed.data.email.toLowerCase());
    if (!account || parsed.data.password !== DEMO_PASSWORD) {
      return err(401, 'UNAUTHENTICATED', 'E-mail ou mot de passe incorrect.');
    }
    if (account.role === 'courier') return HttpResponse.json(tokens(account));
    const challenge = `challenge-${challenges.size + 1}-${Math.random().toString(36).slice(2)}`;
    challenges.set(challenge, account);
    return HttpResponse.json(
      account.enrolled
        ? { challenge }
        : {
            challenge,
            enrollment: {
              secret: DEMO_ENROLL_SECRET,
              otpauthUrl: `otpauth://totp/Streetwear:${account.email}?secret=${DEMO_ENROLL_SECRET}&issuer=Streetwear`,
            },
          },
    );
  }),

  http.post('*/v1/admin/auth/totp', async ({ request }) => {
    const parsed = AdminTotpInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, 'VALIDATION_FAILED', 'Le code doit comporter 6 chiffres.');
    const account = challenges.get(parsed.data.challenge);
    if (!account) return err(401, 'UNAUTHENTICATED', 'La vérification a expiré. Reconnectez-vous.');
    if (parsed.data.code !== DEMO_TOTP_CODE) return err(401, 'UNAUTHENTICATED', 'Code incorrect.');
    challenges.delete(parsed.data.challenge);
    account.enrolled = true;
    return HttpResponse.json(tokens(account));
  }),

  http.get('*/v1/admin/stats/summary', ({ request }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return err(401, 'UNAUTHENTICATED', 'Session expirée.');
    if (role !== 'order_manager' && role !== 'super_admin') {
      return err(403, 'FORBIDDEN', 'Votre rôle ne permet pas cette action.');
    }
    const revenueXof = FIXTURE_ORDERS.reduce((s, o) => s + o.totalXof, 0);
    const byStatus: Record<string, number> = {};
    for (const o of FIXTURE_ORDERS) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    const body: StatsSummary = {
      ordersCount: FIXTURE_ORDERS.length,
      revenueXof,
      averageOrderXof: Math.round(revenueXof / FIXTURE_ORDERS.length),
      byStatus,
      byReception: { home: FIXTURE_ORDERS.length - 1, pickup: 1 },
      topPatterns: [],
      topColors: [],
    };
    return HttpResponse.json(body);
  }),
];
