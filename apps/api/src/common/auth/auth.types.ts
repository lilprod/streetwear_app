export const ADMIN_ROLES = [
  'super_admin',
  'order_manager',
  'production',
  'logistics',
  'courier',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type CustomerIdentity = { userId: string };
export type AdminIdentity = { adminId: string; role: AdminRole };

/** Port à brancher sur SP02 : vérifie un jeton d'accès (JWT `typ` = customer | admin). */
export interface AuthVerifier {
  verifyCustomer(token: string): CustomerIdentity | null | Promise<CustomerIdentity | null>;
  verifyAdmin(token: string): AdminIdentity | null | Promise<AdminIdentity | null>;
}
export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');
