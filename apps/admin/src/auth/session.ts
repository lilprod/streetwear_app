import type { AdminRole } from '@streetwear/shared';
import type { AdminSession } from './auth-api';

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const KEY = 'streetwear.admin.session';

export type Session = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: AdminRole;
  email: string;
  name: string;
  /** Fin absolue de la session : connexion + 8 h, jamais prolongée par un refresh. */
  expiresAt: number;
};

export function sessionFromApi(s: AdminSession, now = Date.now()): Session {
  return {
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    userId: s.user.id,
    role: s.user.role,
    email: s.user.email,
    name: s.user.name,
    expiresAt: now + SESSION_DURATION_MS,
  };
}

export function withRefreshedTokens(prev: Session, s: AdminSession): Session {
  return { ...prev, accessToken: s.accessToken, refreshToken: s.refreshToken };
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
