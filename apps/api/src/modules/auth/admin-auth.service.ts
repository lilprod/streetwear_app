import { Inject, Injectable } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';
import { authenticator } from 'otplib';
import { apiError } from '../../common/api-error';
import { decrypt, encrypt } from '../../common/crypto';
import { hashPassword, verifyPassword } from '../../common/password';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { TokensService } from './tokens.service';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
authenticator.options = { window: 1 };

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: { id: string; email: string; name: string | null; role: AdminRole };
}

export type AdminLoginResult =
  | { type: 'session'; session: AdminSession }
  | {
      type: 'totp_required';
      challenge: string;
      enrollment: { secret: string; otpauthUrl: string } | null;
    };

const ACCESS_MS = 15 * 60_000;

const invalidCredentials = (): Error =>
  apiError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');

@Injectable()
export class AdminAuthService {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  private locked(until: Date | null): void {
    if (until && until > new Date()) {
      const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
      throw apiError(403, 'ACCOUNT_LOCKED', `Compte bloqué, réessayez dans ${minutes} min.`, {
        retryAfterMinutes: minutes,
      });
    }
  }

  private async recordFailure(adminId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ locked_until: Date | null }[]>`
      UPDATE admin_users SET
        failed_logins = CASE WHEN failed_logins + 1 >= ${MAX_FAILURES}::int THEN 0 ELSE failed_logins + 1 END,
        locked_until = CASE WHEN failed_logins + 1 >= ${MAX_FAILURES}::int
          THEN now() + make_interval(mins => ${LOCK_MINUTES}::int) ELSE locked_until END
      WHERE id = ${adminId}::uuid RETURNING locked_until`;
    this.locked(rows[0]?.locked_until ?? null);
  }

  private async session(
    admin: { id: string; email: string; name: string | null; role: AdminRole },
    refresh?: { token: string; expiresAt: Date },
  ): Promise<AdminSession> {
    let r = refresh;
    if (!r) {
      const issued = await this.tokens.issueAdminRefresh(admin.id);
      r = { token: issued.token, expiresAt: issued.expiresAt };
    }
    return {
      accessToken: this.tokens.signAdmin(admin.id, admin.role),
      refreshToken: r.token,
      expiresAt: new Date(Math.min(Date.now() + ACCESS_MS, r.expiresAt.getTime())).toISOString(),
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  }

  private async fullLogin(admin: {
    id: string;
    email: string;
    name: string | null;
    role: AdminRole;
  }): Promise<AdminSession> {
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
    return this.session(admin);
  }

  async refresh(raw: string): Promise<AdminSession> {
    const { ownerId, refreshToken, expiresAt } = await this.tokens.rotate(raw, 'admin');
    const admin = await this.prisma.adminUser.findUnique({ where: { id: ownerId } });
    if (!admin?.active) {
      await this.tokens.revokeFamilyOf(refreshToken);
      throw apiError(401, 'UNAUTHENTICATED', 'Authentification requise ou session expirée.');
    }
    return this.session(admin, { token: refreshToken, expiresAt });
  }

  logout(raw: string): Promise<void> {
    return this.tokens.revokeFamilyOf(raw);
  }

  async login(email: string, password: string): Promise<AdminLoginResult> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin || !admin.active) {
      this.dummyHash ??= hashPassword('dummy-password-for-timing');
      await verifyPassword(await this.dummyHash, password);
      throw invalidCredentials();
    }
    this.locked(admin.lockedUntil);
    if (!(await verifyPassword(admin.passwordHash, password))) {
      await this.recordFailure(admin.id);
      throw invalidCredentials();
    }
    if (admin.role === 'courier') return { type: 'session', session: await this.fullLogin(admin) };
    if (admin.totpSecret) {
      return {
        type: 'totp_required',
        challenge: this.tokens.signChallenge(admin.id),
        enrollment: null,
      };
    }
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(admin.email, 'Streetwear', secret);
    return {
      type: 'totp_required',
      challenge: this.tokens.signChallenge(admin.id, encrypt(this.env.JWT_SECRET, secret)),
      enrollment: { secret, otpauthUrl },
    };
  }

  async verifyTotp(challenge: string, code: string): Promise<AdminSession> {
    const claims = this.tokens.verify(challenge, 'admin_challenge');
    const admin = await this.prisma.adminUser.findUnique({ where: { id: claims.sub } });
    if (!admin?.active) throw invalidCredentials();
    this.locked(admin.lockedUntil);
    const secret = claims.enroll
      ? admin.totpSecret
        ? null
        : decrypt(this.env.JWT_SECRET, claims.enroll)
      : admin.totpSecret
        ? decrypt(this.env.JWT_SECRET, admin.totpSecret)
        : null;
    if (!secret) throw invalidCredentials();
    if (!authenticator.check(code, secret)) {
      await this.recordFailure(admin.id);
      throw apiError(401, 'INVALID_TOTP', 'Code de vérification incorrect.');
    }
    if (claims.enroll) {
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { totpSecret: encrypt(this.env.JWT_SECRET, secret) },
      });
    }
    return this.fullLogin(admin);
  }
}
