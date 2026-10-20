import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AdminRole } from '@prisma/client';
import { authenticator } from 'otplib';
import { AppModule } from '../src/app.module';
import { apiError } from '../src/common/api-error';
import { hashPassword } from '../src/common/password';
import { uuidv7 } from '../src/common/uuid';
import {
  OAUTH_VERIFIER,
  type OAuthIdentity,
  type OAuthProvider,
  type OAuthVerifier,
} from '../src/modules/auth/oauth.verifier';
import { TokensService } from '../src/modules/auth/tokens.service';
import { ConsoleSmsProvider, SMS_PROVIDER } from '../src/modules/sms/sms.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

/** idToken factice : `<sub>|<email>` ; tout autre format est refusé. */
export class FakeOAuthVerifier implements OAuthVerifier {
  async verify(_provider: OAuthProvider, idToken: string): Promise<OAuthIdentity> {
    const [sub, email] = idToken.split('|');
    if (!sub || sub === 'invalid')
      throw apiError(401, 'UNAUTHENTICATED', 'Jeton de connexion invalide.');
    return { sub, email };
  }
}

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  sms: ConsoleSmsProvider;
  tokens: TokensService;
}

export async function createApp(): Promise<TestCtx> {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OAUTH_VERIFIER)
    .useClass(FakeOAuthVerifier)
    .compile();
  const app = mod.createNestApplication({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    sms: app.get<ConsoleSmsProvider>(SMS_PROVIDER),
    tokens: app.get(TokensService),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE audit_logs, refresh_tokens, push_tokens, addresses, otp_codes, users, admin_users, settings CASCADE',
  );
}

export const TEST_PASSWORD = 'correct-horse-battery';

export async function createAdmin(
  ctx: TestCtx,
  role: AdminRole,
  overrides: { email?: string; totpSecret?: string | null; active?: boolean } = {},
) {
  const admin = await ctx.prisma.adminUser.create({
    data: {
      id: uuidv7(),
      email: overrides.email ?? `${role}-${uuidv7()}@example.com`,
      role,
      active: overrides.active ?? true,
      passwordHash: await hashPassword(TEST_PASSWORD),
      totpSecret: overrides.totpSecret ?? null,
    },
  });
  return { admin, token: ctx.tokens.signAdmin(admin.id, role) };
}

export async function createCustomer(ctx: TestCtx, phone = '+22890123456') {
  const user = await ctx.prisma.user.create({ data: { id: uuidv7(), phone } });
  return { user, token: ctx.tokens.signCustomer(user.id) };
}

export const totpNow = (secret: string): string => authenticator.generate(secret);

export const bearer = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});
