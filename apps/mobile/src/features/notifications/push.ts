import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getApi } from '../../api';
import type { ApiClient } from '../../api/types';
import { getStorage, type KeyValueStorage } from '../../storage';
import { recordFromNotification, type PushContent } from './codes';

const PROMPTED_KEY = 'push:prompted';

type Permission = { granted: boolean; canAskAgain?: boolean };

/** Partie d'expo-notifications utilisée ici ; remplaçable dans les tests. */
export interface NotificationsModule {
  getPermissionsAsync(): Promise<Permission>;
  requestPermissionsAsync(): Promise<Permission>;
  getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
  setNotificationChannelAsync?(
    id: string,
    channel: { name: string; importance: number },
  ): Promise<unknown>;
}

export type PushDeps = {
  api: ApiClient;
  storage: Pick<KeyValueStorage, 'getString' | 'set' | 'remove'>;
  platform: 'android' | 'ios';
  projectId?: string;
  load: () => Promise<NotificationsModule>;
};

export function defaultPushDeps(): PushDeps {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return {
    api: getApi(),
    storage: getStorage(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    projectId: extra?.eas?.projectId,
    load: async () => (await import('expo-notifications')) as unknown as NotificationsModule,
  };
}

async function registerToken(deps: PushDeps, mod: NotificationsModule): Promise<boolean> {
  try {
    await mod.setNotificationChannelAsync?.('default', { name: 'Commandes', importance: 4 });
    const token = await mod.getExpoPushTokenAsync(
      deps.projectId ? { projectId: deps.projectId } : undefined,
    );
    await deps.api.registerPushToken({ token: token.data, platform: deps.platform });
    return true;
  } catch {
    return false;
  }
}

/** Demande l'autorisation une seule fois, après la première commande, puis enregistre le jeton. */
export async function promptAfterFirstOrder(
  deps: PushDeps = defaultPushDeps(),
): Promise<'registered' | 'denied' | 'already' | 'failed'> {
  if (deps.storage.getString(PROMPTED_KEY)) return 'already';
  deps.storage.set(PROMPTED_KEY, '1');
  try {
    const mod = await deps.load();
    let perm = await mod.getPermissionsAsync();
    if (!perm.granted) perm = await mod.requestPermissionsAsync();
    if (!perm.granted) return 'denied';
    return (await registerToken(deps, mod)) ? 'registered' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Aux lancements suivants : si l'autorisation est déjà accordée, le jeton est ré-enregistré (sans jamais demander). */
export async function refreshPushToken(deps: PushDeps = defaultPushDeps()): Promise<boolean> {
  try {
    const mod = await deps.load();
    const perm = await mod.getPermissionsAsync();
    return perm.granted ? await registerToken(deps, mod) : false;
  } catch {
    return false;
  }
}

type Response = { notification: { request: { content: PushContent } } };

/** Ouverture au toucher : mémorise le code éventuel et renvoie la route de la commande. */
export function routeForResponse(
  response: Response,
  storage: PushDeps['storage'] = getStorage(),
): string | null {
  const hit = recordFromNotification(storage, response.notification.request.content);
  return hit ? `/orders/${hit.orderId}` : null;
}

/** Notification reçue application ouverte : le code est mémorisé pour l'écran de suivi. */
export function handleReceived(
  notification: { request: { content: PushContent } },
  storage: PushDeps['storage'] = getStorage(),
): void {
  recordFromNotification(storage, notification.request.content);
}

/** Branche les écouteurs (premier plan, toucher, démarrage à froid). Renvoie la fonction de nettoyage. */
export async function installNotificationHandlers(
  navigate: (route: string) => void,
  onReceived?: () => void,
): Promise<() => void> {
  const N = await import('expo-notifications');
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  const received = N.addNotificationReceivedListener((n) => {
    handleReceived(n as unknown as { request: { content: PushContent } });
    onReceived?.();
  });
  const tapped = N.addNotificationResponseReceivedListener((r) => {
    const route = routeForResponse(r as unknown as Response);
    if (route) navigate(route);
  });
  const last = N.getLastNotificationResponse();
  if (last) {
    const route = routeForResponse(last as unknown as Response);
    if (route) navigate(route);
  }
  return () => {
    received.remove();
    tapped.remove();
  };
}
