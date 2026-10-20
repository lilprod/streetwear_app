import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../api-exception';
import {
  AUTH_VERIFIER,
  type AdminIdentity,
  type AdminRole,
  type AuthVerifier,
  type CustomerIdentity,
} from './auth.types';

const ROLES_KEY = 'roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

type AuthedRequest = Request & { customer?: CustomerIdentity; admin?: AdminIdentity };

function bearer(req: Request): string {
  const header = req.headers.authorization;
  const m = header ? /^Bearer (.+)$/.exec(header) : null;
  if (!m?.[1]) throw new ApiException(401, 'UNAUTHENTICATED', 'Authentification requise.');
  return m[1];
}

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = await this.verifier.verifyCustomer(bearer(req));
    if (!identity) throw new ApiException(401, 'UNAUTHENTICATED', 'Session invalide ou expirée.');
    req.customer = identity;
    return true;
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = await this.verifier.verifyAdmin(bearer(req));
    if (!identity) throw new ApiException(401, 'UNAUTHENTICATED', 'Session invalide ou expirée.');
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0 || !roles.includes(identity.role)) {
      throw new ApiException(403, 'FORBIDDEN', 'Vous n’avez pas les droits nécessaires.');
    }
    req.admin = identity;
    return true;
  }
}

export const CurrentCustomer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CustomerIdentity =>
    ctx.switchToHttp().getRequest<AuthedRequest>().customer as CustomerIdentity,
);
