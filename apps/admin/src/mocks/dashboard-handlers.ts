import { http, HttpResponse } from 'msw';
import { FIXTURE_ORDERS, ORDER_STATUSES, uid, type StatsSummary } from '@streetwear/shared';
import { guardRole, MANAGERS } from './admin-guard';

const TOP_PATTERNS: StatsSummary['topPatterns'] = [
  { id: uid(811), name: 'Kente Lomé', count: 42 },
  { id: uid(812), name: 'Losanges Aného', count: 31 },
  { id: uid(813), name: 'Fleurs de Kpalimé', count: 18 },
];
const TOP_COLORS: StatsSummary['topColors'] = [
  { id: uid(821), name: 'Blanc', hex: '#FFFFFF', count: 55 },
  { id: uid(822), name: 'Noir', hex: '#111111', count: 48 },
  { id: uid(823), name: 'Vert pagne', hex: '#2E7D32', count: 12 },
];

export const dashboardHandlers = [
  http.get('*/v1/admin/stats/summary', ({ request }) => {
    const denied = guardRole(request, MANAGERS);
    if (denied) return denied;
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const orders = FIXTURE_ORDERS.filter(
      (o) => (!from || o.createdAt >= from) && (!to || o.createdAt <= to),
    );
    const revenueXof = orders.reduce((s, o) => s + o.totalXof, 0);
    const byStatus = Object.fromEntries(
      ORDER_STATUSES.map((st) => [st, 0]),
    ) as StatsSummary['byStatus'];
    const byReception = { home: 0, pickup: 0 };
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      byReception[o.reception?.type ?? 'home'] += 1;
    }
    const body: StatsSummary = {
      from: from ?? new Date(Date.now() - 29 * 86_400_000).toISOString(),
      to: to ?? new Date().toISOString(),
      ordersCount: orders.length,
      revenueXof,
      averageOrderXof: orders.length ? Math.round(revenueXof / orders.length) : 0,
      byStatus,
      byReception,
      topPatterns: TOP_PATTERNS,
      topColors: TOP_COLORS,
    };
    return HttpResponse.json(body);
  }),
];
