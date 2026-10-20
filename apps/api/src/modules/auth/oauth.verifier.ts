import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { apiError } from '../../common/api-error';
import { ENV, type Env } from '../../config/env';

export type OAuthProvider = 'apple' | 'google';
export interface OAuthIdentity {
  sub: string;
  email?: string;
  name?: string;
}

export interface OAuthVerifier {
  verify(provider: OAuthProvider, idToken: string): Promise<OAuthIdentity>;
}

export const OAUTH_VERIFIER = Symbol('OAUTH_VERIFIER');

const CONFIG = {
  apple: { issuer: 'https://appleid.apple.com', jwks: 'https://appleid.apple.com/auth/keys' },
  google: {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  },
} as const;

@Injectable()
export class JoseOAuthVerifier implements OAuthVerifier {
  private readonly keySets = new Map<OAuthProvider, ReturnType<typeof createRemoteJWKSet>>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  async verify(provider: OAuthProvider, idToken: string): Promise<OAuthIdentity> {
    const audience = provider === 'apple' ? this.env.APPLE_CLIENT_ID : this.env.GOOGLE_CLIENT_ID;
    if (!audience) {
      throw apiError(502, 'PROVIDER_UNAVAILABLE', 'Connexion indisponible pour ce fournisseur.');
    }
    let keys = this.keySets.get(provider);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(CONFIG[provider].jwks));
      this.keySets.set(provider, keys);
    }
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: CONFIG[provider].issuer as string | string[],
        audience,
        algorithms: ['RS256'],
      });
      if (!payload.sub) throw new Error('sub manquant');
      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        name: typeof payload.name === 'string' ? payload.name : undefined,
      };
    } catch {
      throw apiError(401, 'UNAUTHENTICATED', 'Jeton de connexion invalide.');
    }
  }
}
