import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import { apiError } from '../../common/api-error';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthedRequest } from './auth.types';
import { ROLES_KEY } from './roles.decorator';
import { TokensService, unauthenticated } from './tokens.service';

function bearer(req: AuthedRequest): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthenticated();
  return header.slice(7);
}

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const claims = this.tokens.verify(bearer(req), 'customer');
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw unauthenticated();
    req.user = { id: user.id };
    return true;
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const claims = this.tokens.verify(bearer(req), 'admin');
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, role: true, active: true },
    });
    if (!admin?.active) throw unauthenticated();
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(admin.role)) {
      throw apiError(403, 'FORBIDDEN', 'Votre rôle ne permet pas cette action.');
    }
    req.admin = { id: admin.id, email: admin.email, role: admin.role };
    return true;
  }
}
