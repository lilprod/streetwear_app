import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { apiError } from '../../common/api-error';
import { sha256 } from '../../common/crypto';
import { uuidv7 } from '../../common/uuid';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessClaims } from './auth.types';
import type { AdminRole } from '@prisma/client';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const ADMIN_SESSION_MS = 8 * 3600 * 1000;

export const unauthenticated = (): Error =>
  apiError(401, 'UNAUTHENTICATED', 'Authentification requise ou session expirée.');

@Injectable()
export class TokensService {
  private readonly jwt: JwtService;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.jwt = new JwtService({ secret: env.JWT_SECRET });
  }

  signCustomer(userId: string): string {
    return this.jwt.sign({ typ: 'customer' }, { subject: userId, expiresIn: '15m' });
  }

  signAdmin(adminId: string, role: AdminRole): string {
    return this.jwt.sign({ typ: 'admin', role }, { subject: adminId, expiresIn: '15m' });
  }

  signChallenge(adminId: string, enroll?: string): string {
    return this.jwt.sign(
      { typ: 'admin_challenge', ...(enroll ? { enroll } : {}) },
      { subject: adminId, expiresIn: '5m' },
    );
  }

  verify(token: string, typ: AccessClaims['typ']): AccessClaims {
    try {
      const claims = this.jwt.verify<AccessClaims>(token, { algorithms: ['HS256'] });
      if (claims.typ !== typ || !claims.sub) throw unauthenticated();
      return claims;
    } catch {
      throw unauthenticated();
    }
  }

  async issueRefresh(userId: string): Promise<string> {
    return this.create({ userId }, uuidv7(), new Date(Date.now() + REFRESH_TTL_MS));
  }

  /** Session admin : 8 h maximum depuis la connexion, sans prolongation. */
  async issueAdminRefresh(adminUserId: string): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_MS);
    return { token: await this.create({ adminUserId }, uuidv7(), expiresAt), expiresAt };
  }

  private async create(
    owner: { userId: string } | { adminUserId: string },
    familyId: string,
    expiresAt: Date,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: { id: uuidv7(), ...owner, familyId, tokenHash: sha256(raw), expiresAt },
    });
    return raw;
  }

  /** Rotation : un jeton déjà utilisé révoque toute sa famille. */
  async rotate(
    raw: string,
    kind: 'customer' | 'admin',
  ): Promise<{ ownerId: string; refreshToken: string; expiresAt: Date }> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          user_id: string | null;
          admin_user_id: string | null;
          family_id: string;
          expires_at: Date;
          revoked_at: Date | null;
        }[]
      >`SELECT id, user_id, admin_user_id, family_id, expires_at, revoked_at FROM refresh_tokens
        WHERE token_hash = ${sha256(raw)} FOR UPDATE`;
      const row = rows[0];
      const ownerId = kind === 'admin' ? row?.admin_user_id : row?.user_id;
      if (!row || !ownerId) return { ok: false as const };
      if (row.revoked_at) {
        await tx.refreshToken.updateMany({
          where: { familyId: row.family_id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { ok: false as const };
      }
      if (row.expires_at < new Date()) return { ok: false as const };
      await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      const next = randomBytes(32).toString('base64url');
      await tx.refreshToken.create({
        data: {
          id: uuidv7(),
          ...(kind === 'admin' ? { adminUserId: ownerId } : { userId: ownerId }),
          familyId: row.family_id,
          tokenHash: sha256(next),
          expiresAt: kind === 'admin' ? row.expires_at : new Date(Date.now() + REFRESH_TTL_MS),
        },
      });
      return {
        ok: true as const,
        ownerId,
        refreshToken: next,
        expiresAt: row.expires_at,
      };
    });
    if (!outcome.ok) throw unauthenticated();
    return outcome;
  }

  async revokeFamilyOf(raw: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
