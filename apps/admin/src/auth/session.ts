import { ADMIN_ROLES, type AdminRole } from '@streetwear/shared';

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const KEY = 'streetwear.admin.session';

export type Session = {
  accessToken: string;
  refreshToken?: string;
  role: AdminRole;
  email: string;
  expiresAt: number;
};

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function sessionFromTokens(
  tokens: { accessToken: string; refreshToken?: string },
  now = Date.now(),
): Session | null {
  const claims = decodeJwt(tokens.accessToken);
  const role = claims?.role;
  if (!claims || claims.typ !== 'admin' || !ADMIN_ROLES.includes(role as AdminRole)) return null;
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    role: role as AdminRole,
    email: typeof claims.email === 'string' ? claims.email : '',
    expiresAt: now + SESSION_DURATION_MS,
  };
}

export function loadSession(now = Date.now()): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.expiresAt <= now) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export const saveSession = (s: Session): void => localStorage.setItem(KEY, JSON.stringify(s));
export const clearSession = (): void => localStorage.removeItem(KEY);
