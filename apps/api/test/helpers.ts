import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { AdminRole } from '@prisma/client';
import { authenticator } from 'otplib';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { seedCatalog } from '../src/catalog/seed';
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
import {
  FakeOrderTransitionPort,
  ORDER_TRANSITION_PORT,
} from '../src/modules/delivery/order-transition.port';
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

export interface AppOptions {
  /** Remplace le port de transition réel (SP04) par l'adaptateur factice de SP06. */
  fakeOrderPort?: boolean;
  /** Remplace des fournisseurs (file, stockage…) avant la compilation. */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createApp(opts: AppOptions = {}): Promise<TestCtx> {
  const fake = new FakeOrderTransitionPort();
  let builder = Test.createTestingModule({
    imports: [AppModule],
    providers: opts.fakeOrderPort ? [{ provide: FakeOrderTransitionPort, useValue: fake }] : [],
  })
    .overrideProvider(OAUTH_VERIFIER)
    .useClass(FakeOAuthVerifier);
  if (opts.fakeOrderPort) {
    builder = builder.overrideProvider(ORDER_TRANSITION_PORT).useValue(fake);
  }
  if (opts.configure) builder = opts.configure(builder);
  const mod = await builder.compile();
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
    'TRUNCATE production_jobs, stock_movements, stock_items, order_status_history, order_items, deliveries, pickups, orders, cart_items, carts, delivery_zones, audit_logs, refresh_tokens, push_tokens, addresses, otp_codes, users, admin_users, settings CASCADE',
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

const ADMIN_ROLES_FOR_TESTS = [
  'super_admin',
  'order_manager',
  'production',
  'logistics',
  'courier',
] as const;

export type AuthHeader = [string, string];
export type Method = 'get' | 'post' | 'patch' | 'delete';

export function call(app: INestApplication, method: Method, url: string): request.Test {
  return request(app.getHttpServer())[method](url);
}

/** App complète + catalogue amorcé + un admin par rôle (vrais jetons signés). */
export async function buildApp(opts: AppOptions = {}) {
  const ctx = await createApp(opts);
  await seedCatalog(ctx.prisma);
  const admins = {} as Record<AdminRole, AuthHeader>;
  for (const role of ADMIN_ROLES_FOR_TESTS) {
    const { token } = await createAdmin(ctx, role);
    admins[role] = ['Authorization', `Bearer ${token}`];
  }
  const adminAuth = (role: AdminRole): AuthHeader => admins[role];
  const newCustomer = async (): Promise<{ id: string; auth: AuthHeader }> => {
    const phone = `+228${String(90_000_000 + Math.floor(Math.random() * 9_999_999))}`;
    const { user, token } = await createCustomer(ctx, phone);
    return { id: user.id, auth: ['Authorization', `Bearer ${token}`] };
  };
  return { app: ctx.app, prisma: ctx.prisma, ctx, adminAuth, newCustomer };
}

/** Commande minimale (en attente de paiement) pour les tests qui n'ont besoin que de la ligne. */
export async function insertOrder(
  prisma: PrismaService,
  userId: string,
  overrides: Partial<{ id: string; receptionType: 'home' | 'pickup' }> = {},
) {
  const id = overrides.id ?? uuidv7();
  return prisma.order.create({
    data: {
      id,
      number: `TG-T${id.slice(-8)}`,
      userId,
      subtotalXof: 10000,
      deliveryFeeXof: 0,
      totalXof: 10000,
      vatIncludedXof: 1525,
      paymentMethod: 'tmoney',
      receptionType: overrides.receptionType ?? 'home',
      receptionSnapshot: {},
      idempotencyKey: uuidv7(),
      idempotencyHash: 'test',
    },
  });
}
