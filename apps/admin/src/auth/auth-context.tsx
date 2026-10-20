import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminRole } from '@streetwear/shared';
import { configureApi } from '../lib/api';
import { clearSession, loadSession, saveSession, sessionFromTokens, type Session } from './session';
import type { AuthTokens } from './auth-api';

type AuthValue = {
  session: Session | null;
  role: AdminRole | null;
  expired: boolean;
  signIn: (tokens: AuthTokens) => Session | null;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [expired, setExpired] = useState(false);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const signIn = useCallback((tokens: AuthTokens) => {
    const s = sessionFromTokens(tokens);
    if (!s) return null;
    saveSession(s);
    setSession(s);
    setExpired(false);
    return s;
  }, []);

  useEffect(() => {
    configureApi({
      getToken: () => loadSession()?.accessToken ?? null,
      onUnauthorized: () => {
        clearSession();
        setSession(null);
        setExpired(true);
      },
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
  }, [session]);

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
