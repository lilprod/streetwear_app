import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { apiError } from '../../common/api-error';
import { hmac } from '../../common/crypto';
import { maskPhone } from '../../common/redact';
import { uuidv7 } from '../../common/uuid';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider';
import { toUserDto, type UserDto } from '../users/user.mapper';
import { OAUTH_VERIFIER, type OAuthProvider, type OAuthVerifier } from './oauth.verifier';
import { TokensService } from './tokens.service';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS_PER_HOUR = 3;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
  isNewUser: boolean;
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(OAUTH_VERIFIER) private readonly oauth: OAuthVerifier,
  ) {}

  private hashCode(phone: string, code: string): string {
    return hmac(this.env.JWT_SECRET, `${phone}:${code}`);
  }

  async requestOtp(phone: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'otp:' + phone}))`;
      const since = new Date(Date.now() - 3600_000);
      const recent = await tx.otpCode.findMany({
        where: { phone, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
        const oldest = recent[recent.length - OTP_MAX_SENDS_PER_HOUR]?.createdAt ?? new Date();
        const retryAt = oldest.getTime() + 3600_000;
        const minutes = Math.max(1, Math.ceil((retryAt - Date.now()) / 60_000));
        throw apiError(429, 'RATE_LIMITED', `Trop de demandes, réessaie dans ${minutes} min.`, {
          retryAfterMinutes: minutes,
        });
      }
      await tx.otpCode.updateMany({
        where: { phone, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.otpCode.create({
        data: {
          id: uuidv7(),
          phone,
          codeHash: this.hashCode(phone, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });
    });
    try {
      await this.sms.send(phone, `Streetwear : ton code est ${code}. Il expire dans 5 minutes.`);
    } catch {
      this.logger.error(`Échec d'envoi du SMS à ${maskPhone(phone)}`);
      throw apiError(502, 'PROVIDER_UNAVAILABLE', "Le SMS n'a pas pu être envoyé, réessaie.");
    }
  }

  async verifyOtp(phone: string, code: string): Promise<AuthResult> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; code_hash: string; attempts: number }[]>`
        SELECT id, code_hash, attempts FROM otp_codes
        WHERE phone = ${phone} AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      const row = rows[0];
      if (!row) return { ok: false as const, error: 'OTP_INVALID' };
      if (row.attempts >= OTP_MAX_ATTEMPTS)
        return { ok: false as const, error: 'OTP_ATTEMPTS_EXCEEDED' };
      if (row.code_hash !== this.hashCode(phone, code)) {
        await tx.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
        return { ok: false as const, error: left > 0 ? 'OTP_INVALID' : 'OTP_ATTEMPTS_EXCEEDED' };
      }
      await tx.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      const existing = await tx.user.findUnique({ where: { phone } });
      if (existing) return { ok: true as const, user: existing, isNewUser: false };
      const user = await tx.user.create({ data: { id: uuidv7(), phone } });
      return { ok: true as const, user, isNewUser: true };
    });
    if (!outcome.ok) {
      if (outcome.error === 'OTP_ATTEMPTS_EXCEEDED') {
        throw apiError(400, 'OTP_ATTEMPTS_EXCEEDED', 'Trop d’essais, demande un nouveau code.');
      }
      throw apiError(400, 'OTP_INVALID', 'Code incorrect ou expiré.');
    }
    return this.session(outcome.user, outcome.isNewUser);
  }

  async oauthLogin(provider: OAuthProvider, idToken: string): Promise<AuthResult> {
    const identity = await this.oauth.verify(provider, idToken);
    const where = provider === 'apple' ? { appleSub: identity.sub } : { googleSub: identity.sub };
    const found = await this.prisma.user.findUnique({ where });
    if (found && !found.deletedAt) return this.session(found, false);
    try {
      const user = await this.prisma.user.create({
        data: {
          id: uuidv7(),
          ...where,
          email: identity.email ?? null,
          name: identity.name ?? null,
        },
      });
      return this.session(user, true);
    } catch {
      const again = await this.prisma.user.findUnique({ where });
      if (again) return this.session(again, false);
      throw apiError(401, 'UNAUTHENTICATED', 'Connexion impossible.');
    }
  }

  async refresh(raw: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { ownerId, refreshToken } = await this.tokens.rotate(raw, 'customer');
    return { accessToken: this.tokens.signCustomer(ownerId), refreshToken };
  }

  logout(raw: string): Promise<void> {
    return this.tokens.revokeFamilyOf(raw);
  }

  private async session(
    user: Parameters<typeof toUserDto>[0],
    isNewUser: boolean,
  ): Promise<AuthResult> {
    return {
      accessToken: this.tokens.signCustomer(user.id),
      refreshToken: await this.tokens.issueRefresh(user.id),
      user: toUserDto(user),
      isNewUser,
    };
  }
}
