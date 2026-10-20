import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminRole } from '@streetwear/shared';
import { configureApi } from '../lib/api';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionFromApi,
  withRefreshedTokens,
  type Session,
} from './session';
import { adminLogout, adminRefresh, type AdminSession } from './auth-api';

type AuthValue = {
  session: Session | null;
  role: AdminRole | null;
  expired: boolean;
  signIn: (s: AdminSession) => Session;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [expired, setExpired] = useState(false);

  const signOut = useCallback(() => {
    const current = loadSession();
    if (current) void adminLogout(current.refreshToken).catch(() => undefined);
    clearSession();
    setSession(null);
  }, []);

  const signIn = useCallback((api: AdminSession) => {
    const s = sessionFromApi(api);
    saveSession(s);
    setSession(s);
    setExpired(false);
    return s;
  }, []);

  useEffect(() => {
    const expire = () => {
      clearSession();
      setSession(null);
      setExpired(true);
    };
    configureApi({
      getToken: () => loadSession()?.accessToken ?? null,
      refresh: async () => {
        const current = loadSession();
        if (!current) return null;
        try {
          const next = withRefreshedTokens(current, await adminRefresh(current.refreshToken));
          saveSession(next);
          setSession(next);
          return next.accessToken;
        } catch {
          return null;
        }
      },
      onUnauthorized: expire,
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    const delay = Math.min(session.expiresAt - Date.now(), 2 ** 31 - 1);
    const id = setTimeout(
      () => {
        clearSession();
        setSession(null);
        setExpired(true);
      },
      Math.max(delay, 0),
    );
    return () => clearTimeout(id);
  }, [session?.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({ session, role: session?.role ?? null, expired, signIn, signOut }),
    [session, expired, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
