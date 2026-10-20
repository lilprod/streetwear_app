import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminPrincipal, AuthedRequest, CustomerPrincipal } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CustomerPrincipal =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user as CustomerPrincipal,
);

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminPrincipal =>
    ctx.switchToHttp().getRequest<AuthedRequest>().admin as AdminPrincipal,
);
