import { Injectable } from '@nestjs/common';
import {
  ADMIN_ROLES,
  type AdminIdentity,
  type AdminRole,
  type AuthVerifier,
  type CustomerIdentity,
} from './auth.types';

/**
 * Remplacement provisoire de SP02. Jetons `test-customer.<uuid>` et `test-admin.<role>.<uuid>`,
 * acceptés uniquement avec NODE_ENV=test ; sinon tout est refusé (échec fermé).
 */
@Injectable()
export class TestAuthVerifier implements AuthVerifier {
  verifyCustomer(token: string): CustomerIdentity | null {
    if (process.env.NODE_ENV !== 'test') return null;
    const m = /^test-customer\.([0-9a-f-]{36})$/.exec(token);
    return m?.[1] ? { userId: m[1] } : null;
  }

  verifyAdmin(token: string): AdminIdentity | null {
    if (process.env.NODE_ENV !== 'test') return null;
    const m = /^test-admin\.([a-z_]+)\.([0-9a-f-]{36})$/.exec(token);
    if (!m?.[1] || !m[2] || !ADMIN_ROLES.includes(m[1] as AdminRole)) return null;
    return { adminId: m[2], role: m[1] as AdminRole };
  }
}
