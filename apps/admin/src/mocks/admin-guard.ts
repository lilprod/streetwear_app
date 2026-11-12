import { HttpResponse } from 'msw';
import type { AdminRole, ApiError } from '@streetwear/shared';
import { roleFromAuthHeader } from './handlers';

export const apiErr = (
  status: number,
  code: ApiError['error']['code'],
  message: string,
  details?: unknown,
) =>
  HttpResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );

export function guardRole(request: Request, roles: readonly AdminRole[]): Response | null {
  const role = roleFromAuthHeader(request.headers.get('Authorization'));
  if (!role) return apiErr(401, 'UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.');
  if (!roles.includes(role))
    return apiErr(403, 'FORBIDDEN', 'Votre rôle ne permet pas cette action.');
  return null;
}

export const SUPER: readonly AdminRole[] = ['super_admin'];
export const MANAGERS: readonly AdminRole[] = ['order_manager', 'super_admin'];

export const pageOf = <T extends { id: string }>(
  rows: T[],
  cursor: string | null,
  limit: number,
) => {
  const start = cursor ? Math.max(0, rows.findIndex((r) => r.id === cursor) + 1) : 0;
  const page = rows.slice(start, start + limit);
  const hasMore = start + limit < rows.length;
  return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
};
