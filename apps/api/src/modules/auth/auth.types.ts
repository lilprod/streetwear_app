import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';

export interface CustomerPrincipal {
  id: string;
}

export interface AdminPrincipal {
  id: string;
  email: string;
  role: AdminRole;
}

export type AuthedRequest = Request & { user?: CustomerPrincipal; admin?: AdminPrincipal };

export interface AccessClaims {
  sub: string;
  typ: 'customer' | 'admin' | 'admin_challenge';
  role?: AdminRole;
  enroll?: string;
}
