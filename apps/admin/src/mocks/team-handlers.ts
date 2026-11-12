import { http, HttpResponse } from 'msw';
import { uid } from '@streetwear/shared';
import type { AdminRole } from '@streetwear/shared';
import { apiErr, guardRole, pageOf, SUPER } from './admin-guard';
import { DEMO_ACCOUNTS, demoUserId, roleFromAuthHeader } from './handlers';
import type { AdminAccount, AuditEntry } from '../lib/team-api';

const seedAccounts = (): AdminAccount[] =>
  DEMO_ACCOUNTS.map((a) => ({
    id: demoUserId(a.role),
    email: a.email,
    name: a.email.split('@')[0] ?? null,
    role: a.role,
    active: true,
    totpEnabled: a.enrolled,
    createdAt: '2026-10-01T08:00:00.000Z',
  }));

const seedAudit = (): AuditEntry[] => [
  {
    id: '3',
    adminUserId: demoUserId('super_admin'),
    adminEmail: 'admin@streetwear.test',
    action: 'update',
    entity: 'pattern',
    entityId: uid(811),
    before: { active: true },
    after: { active: false },
    createdAt: '2026-11-11T09:00:00.000Z',
  },
  {
    id: '2',
    adminUserId: demoUserId('super_admin'),
    adminEmail: 'admin@streetwear.test',
    action: 'update',
    entity: 'admin_user',
    entityId: demoUserId('order_manager'),
    before: { role: 'production' },
    after: { role: 'order_manager' },
    createdAt: '2026-11-10T15:20:00.000Z',
  },
  {
    id: '1',
    adminUserId: demoUserId('super_admin'),
    adminEmail: 'admin@streetwear.test',
    action: 'create',
    entity: 'setting',
    entityId: 'cod_deposit_percent',
    before: null,
    after: { value: 50 },
    createdAt: '2026-11-09T10:00:00.000Z',
  },
];

let accounts = seedAccounts();
let audit = seedAudit();

export const resetTeamState = (): void => {
  accounts = seedAccounts();
  audit = seedAudit();
};

const ROLES: readonly AdminRole[] = [
  'super_admin',
  'order_manager',
  'production',
  'logistics',
  'courier',
];
const PHONE = /^\+228\d{8}$/;

export const teamHandlers = [
  http.get('*/v1/admin/users', ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const url = new URL(request.url);
    return HttpResponse.json(
      pageOf(accounts, url.searchParams.get('cursor'), Number(url.searchParams.get('limit') ?? 20)),
    );
  }),

  http.post('*/v1/admin/users', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as {
      email: string;
      name?: string;
      password: string;
      role: AdminRole;
      phone?: string;
    };
    if (!ROLES.includes(b.role) || b.password.length < 12) {
      return apiErr(400, 'VALIDATION_FAILED', 'Les informations saisies sont invalides.');
    }
    if (b.role === 'courier' && (!b.phone || !PHONE.test(b.phone))) {
      return apiErr(400, 'VALIDATION_FAILED', 'Numéro attendu au format +228XXXXXXXX.');
    }
    if (accounts.some((a) => a.email === b.email.toLowerCase())) {
      return apiErr(409, 'EMAIL_ALREADY_USED', 'Cette adresse e-mail est déjà utilisée.');
    }
    const row: AdminAccount = {
      id: uid(1400 + accounts.length),
      email: b.email.toLowerCase(),
      name: b.name ?? null,
      role: b.role,
      active: true,
      totpEnabled: false,
      createdAt: new Date().toISOString(),
    };
    accounts = [...accounts, row];
    return HttpResponse.json(row, { status: 201 });
  }),

  http.patch('*/v1/admin/users/:id', async ({ request, params }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const actorRole = roleFromAuthHeader(request.headers.get('Authorization'));
    const row = accounts.find((a) => a.id === params.id);
    if (!row) return apiErr(404, 'NOT_FOUND', 'Élément introuvable.');
    const b = (await request.json()) as {
      name?: string | null;
      role?: AdminRole;
      active?: boolean;
      resetTotp?: true;
    };
    const isSelf = actorRole !== null && row.id === demoUserId(actorRole);
    if (isSelf && ((b.role !== undefined && b.role !== row.role) || b.active === false)) {
      return apiErr(
        409,
        'CANNOT_MODIFY_SELF',
        'Vous ne pouvez pas modifier votre propre rôle ni vous désactiver.',
      );
    }
    const next: AdminAccount = {
      ...row,
      ...(b.name !== undefined && { name: b.name }),
      ...(b.role !== undefined && { role: b.role }),
      ...(b.active !== undefined && { active: b.active }),
      ...(b.resetTotp && { totpEnabled: false }),
    };
    accounts = accounts.map((a) => (a.id === row.id ? next : a));
    audit = [
      {
        id: String(audit.length + 10),
        adminUserId: null,
        adminEmail: null,
        action: 'update',
        entity: 'admin_user',
        entityId: row.id,
        before: { role: row.role, active: row.active },
        after: { role: next.role, active: next.active },
        createdAt: new Date().toISOString(),
      },
      ...audit,
    ];
    return HttpResponse.json(next);
  }),

  http.get('*/v1/admin/audit-logs', ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const url = new URL(request.url);
    const entity = url.searchParams.get('entity');
    const entityId = url.searchParams.get('entityId');
    const rows = audit.filter(
      (e) => (!entity || e.entity === entity) && (!entityId || e.entityId === entityId),
    );
    return HttpResponse.json(
      pageOf(rows, url.searchParams.get('cursor'), Number(url.searchParams.get('limit') ?? 20)),
    );
  }),
];
