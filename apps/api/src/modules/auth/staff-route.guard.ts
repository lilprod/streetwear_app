import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AdminAuthGuard } from './guards';
import { PUBLIC_KEY } from './roles.decorator';

const STAFF_PATH = /^\/v1\/(admin|courier)(\/|$)/;

/** Filet de sécurité global : toute route /admin/* et /courier/* exige un jeton admin. */
@Injectable()
export class StaffRouteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminGuard: AdminAuthGuard,
  ) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> | boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!STAFF_PATH.test(req.path)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    return isPublic ? true : this.adminGuard.canActivate(ctx);
  }
}
