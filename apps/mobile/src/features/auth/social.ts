import { Platform } from 'react-native';
import type { OAuthProvider } from '../../api/types';

/** `getIdToken` renvoie `null` quand l'utilisateur annule. */
export type SocialProvider = {
  isAvailable: () => boolean;
  getIdToken: () => Promise<string | null>;
};

const apple: SocialProvider = {
  isAvailable: () => Platform.OS === 'ios',
  async getIdToken() {
    const AppleAuthentication = await import('expo-apple-authentication');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      return credential.identityToken;
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
      throw e;
    }
  },
};

let registry: Partial<Record<OAuthProvider, SocialProvider>> = { apple };

/** Point d'accroche : Google Sign-In se branche ici (client natif ou expo-auth-session). */
export function setSocialProvider(name: OAuthProvider, provider: SocialProvider | null): void {
  registry = { ...registry, [name]: provider ?? undefined };
}

export const getSocialProvider = (name: OAuthProvider): SocialProvider | null =>
  registry[name] ?? null;
