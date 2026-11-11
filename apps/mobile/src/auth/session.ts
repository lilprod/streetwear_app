import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { UserSchema, type AuthResult, type User } from '@streetwear/shared';
import { getApi, onSessionExpired, type ApiClient } from '../api';
import { getStorage, type KeyValueStorage } from '../storage';
import { getTokenStore, type TokenStore } from './tokens';

const USER_KEY = 'session:user';

export type SessionStatus = 'booting' | 'anonymous' | 'authenticated';

export type SessionState = {
  status: SessionStatus;
  user: User | null;
  /** Vrai quand la session a été perdue (rafraîchissement refusé) : l'écran propose de se reconnecter. */
  expired: boolean;
};

export const sessionStore = createStore<SessionState>(() => ({
  status: 'booting',
  user: null,
  expired: false,
}));

export const useSession = <T>(selector: (s: SessionState) => T): T =>
  useStore(sessionStore, selector);

export const isAuthenticated = (): boolean => sessionStore.getState().status === 'authenticated';

type Deps = {
  api?: ApiClient;
  tokens?: TokenStore;
  storage?: Pick<KeyValueStorage, 'getString' | 'set' | 'remove'>;
};

function readCachedUser(storage: NonNullable<Deps['storage']>): User | null {
  const raw = storage.getString(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = UserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Au lancement : session restaurée depuis expo-secure-store, profil rafraîchi en arrière-plan. */
export async function bootstrapSession(deps: Deps = {}): Promise<void> {
  const tokens = deps.tokens ?? getTokenStore();
  const storage = deps.storage ?? getStorage();
  const stored = await tokens.get();
  if (!stored) {
    sessionStore.setState({ status: 'anonymous', user: null });
    return;
  }
  sessionStore.setState({ status: 'authenticated', user: readCachedUser(storage), expired: false });
  try {
    const user = await (deps.api ?? getApi()).getMe();
    if (sessionStore.getState().status === 'authenticated') {
      storage.set(USER_KEY, JSON.stringify(user));
      sessionStore.setState({ user });
    }
  } catch {
    // hors ligne ou erreur serveur : on garde la session ; un 401 définitif a déjà déclenché expireSession
  }
}

export async function startSession(result: AuthResult, deps: Deps = {}): Promise<void> {
  const tokens = deps.tokens ?? getTokenStore();
  const storage = deps.storage ?? getStorage();
  await tokens.set({ accessToken: result.accessToken, refreshToken: result.refreshToken });
  storage.set(USER_KEY, JSON.stringify(result.user));
  sessionStore.setState({ status: 'authenticated', user: result.user, expired: false });
}

export function updateSessionUser(user: User, deps: Deps = {}): void {
  (deps.storage ?? getStorage()).set(USER_KEY, JSON.stringify(user));
  sessionStore.setState({ user });
}

export async function endSession(deps: Deps = {}): Promise<void> {
  const tokens = deps.tokens ?? getTokenStore();
  const storage = deps.storage ?? getStorage();
  const stored = await tokens.get();
  await tokens.clear();
  storage.remove(USER_KEY);
  sessionStore.setState({ status: 'anonymous', user: null, expired: false });
  if (stored) await (deps.api ?? getApi()).logout(stored.refreshToken).catch(() => undefined);
}

export function expireSession(): void {
  getStorage().remove(USER_KEY);
  sessionStore.setState({ status: 'anonymous', user: null, expired: true });
}

onSessionExpired(expireSession);
