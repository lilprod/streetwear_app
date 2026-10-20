import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';
export const Roles = (...roles: AdminRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
/** Route sous /admin ou /courier exemptée de l'authentification (connexion). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
