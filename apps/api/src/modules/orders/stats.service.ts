import { Injectable } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';
import { ORDER_STATUSES, type StatsSummary } from '@streetwear/shared';
import { apiError } from '../../common/api-error';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Chiffre d'affaires = somme des `totalXof` des commandes créées dans la période dont le
 * paiement est confirmé (payée) ou l'acompte versé et qui n'ont été ni annulées, ni remboursées,
 * ni retournées : statuts ci-dessous. Une commande « acompte versé » compte pour son total.
 */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  'paid',
  'deposit_paid',
  'in_production',
  'ready',
  'shipped',
  'ready_for_pickup',
  'delivered',
  'delivery_failed',
];

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const TOP = 10;

/** Jour civil Africa/Lome (UTC+0, sans heure d'été) au format AAAA-MM-JJ. */
export function lomeDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);

export function resolveRange(
  q: { from?: string; to?: string },
  now: Date = new Date(),
): { fromDay: string; toDay: string; from: Date; to: Date } {
  const toDay = q.to ? lomeDay(new Date(q.to)) : lomeDay(now);
  const fromDay = q.from
    ? lomeDay(new Date(q.from))
    : lomeDay(new Date(dayStart(toDay).getTime() - 29 * DAY_MS));
  const from = dayStart(fromDay);
  const to = new Date(dayStart(toDay).getTime() + DAY_MS - 1);
  if (from.getTime() > to.getTime() || (to.getTime() - from.getTime()) / DAY_MS > MAX_DAYS) {
    throw apiError(400, 'VALIDATION_FAILED', 'Période invalide (366 jours maximum).', {
      fieldErrors: { from: ['Période invalide.'] },
    });
  }
  return { fromDay, toDay, from, to };
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(q: { from?: string; to?: string }, now?: Date): Promise<StatsSummary> {
    const { from, to } = resolveRange(q, now);
    const created = { gte: from, lte: to };
    const revenueWhere = { createdAt: created, status: { in: [...REVENUE_STATUSES] } };

    const [byStatus, byReception, revenue, patterns, colors] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: created },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['receptionType'],
        where: { createdAt: created },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: revenueWhere,
        _sum: { totalXof: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ id: string; name: string | null; count: number }[]>`
        SELECT p.pid AS id, pt.name AS name, SUM(p.quantity)::int AS count
        FROM (
          SELECT DISTINCT oi.id AS item_id, oi.quantity, l.layer ->> 'patternId' AS pid
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          CROSS JOIN LATERAL jsonb_each(oi.design_snapshot -> 'zones') AS z(zone_name, zone)
          CROSS JOIN LATERAL jsonb_array_elements(z.zone -> 'layers') AS l(layer)
          WHERE o.created_at >= ${from} AND o.created_at <= ${to}
            AND o.status::text = ANY(${[...REVENUE_STATUSES]}::text[])
            AND l.layer ->> 'type' = 'pattern'
        ) p
        LEFT JOIN patterns pt ON pt.id = p.pid
        GROUP BY p.pid, pt.name
        ORDER BY count DESC, p.pid ASC
        LIMIT ${TOP}`,
      this.prisma.$queryRaw<
        { id: string; name: string | null; hex: string | null; count: number }[]
      >`
        SELECT oi.color_id AS id, c.name AS name, c.hex AS hex, SUM(oi.quantity)::int AS count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN tshirt_colors c ON c.id = oi.color_id
        WHERE o.created_at >= ${from} AND o.created_at <= ${to}
          AND o.status::text = ANY(${[...REVENUE_STATUSES]}::text[])
        GROUP BY oi.color_id, c.name, c.hex
        ORDER BY count DESC, oi.color_id ASC
        LIMIT ${TOP}`,
    ]);

    const status = Object.fromEntries(
      ORDER_STATUSES.map((s) => [s, 0]),
    ) as StatsSummary['byStatus'];
    for (const g of byStatus) status[g.status] = g._count._all;
    const reception = { home: 0, pickup: 0 };
    for (const g of byReception) reception[g.receptionType] = g._count._all;
    const revenueXof = revenue._sum.totalXof ?? 0;
    const paidCount = revenue._count._all;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ordersCount: byStatus.reduce((n, g) => n + g._count._all, 0),
      revenueXof,
      averageOrderXof: paidCount > 0 ? Math.round(revenueXof / paidCount) : 0,
      byStatus: status,
      byReception: reception,
      topPatterns: patterns.map((p) => ({ id: p.id, name: p.name ?? p.id, count: p.count })),
      topColors: colors.map((c) => ({
        id: c.id,
        name: c.name ?? c.id,
        hex: c.hex ?? '#000000',
        count: c.count,
      })),
    };
  }
}
