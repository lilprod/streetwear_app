import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_KEYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const;
const WEEK_ORDER = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SLOTS_HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

export const OPENING_KEY_RE = /^(lun|mar|mer|jeu|ven|sam|dim)(-(lun|mar|mer|jeu|ven|sam|dim))?$/;
export const OPENING_VALUE_RE = /^(fermé|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)$/;

/** Horaire d'un jour : une clé de jour exacte l'emporte sur une plage (« lun-sam »). Dates en UTC = Africa/Lome. */
export function hoursFor(
  openingHours: Record<string, string>,
  dayIndex: number,
): { open: number; close: number } | null {
  const day = DAY_KEYS[dayIndex] as (typeof DAY_KEYS)[number];
  let value = openingHours[day];
  if (value === undefined) {
    const pos = WEEK_ORDER.indexOf(day);
    for (const [key, v] of Object.entries(openingHours)) {
      const [from, to] = key.split('-');
      if (!to) continue;
      const a = WEEK_ORDER.indexOf(from as (typeof WEEK_ORDER)[number]);
      const b = WEEK_ORDER.indexOf(to as (typeof WEEK_ORDER)[number]);
      if (a >= 0 && b >= 0 && (a <= b ? pos >= a && pos <= b : pos >= a || pos <= b)) {
        value = v;
        break;
      }
    }
  }
  const m = value ? SLOTS_HOURS_RE.exec(value) : null;
  if (!m) return null;
  const open = Number(m[1]) * 60 + Number(m[2]);
  const close = Number(m[3]) * 60 + Number(m[4]);
  return close > open ? { open, close } : null;
}

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crée les créneaux d'une heure des `days` prochains jours ; idempotent (unicité magasin + début). */
  async generate(
    storeId: string,
    opts: { days?: number; capacity?: number; now?: Date } = {},
  ): Promise<number> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store?.active) return 0;
    const now = opts.now ?? new Date();
    const capacity = opts.capacity ?? store.defaultSlotCapacity;
    const hours = store.openingHours as Record<string, string>;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const data: { id: string; storeId: string; startsAt: Date; endsAt: Date; capacity: number }[] =
      [];
    for (let d = 0; d < (opts.days ?? 14); d++) {
      const dayStart = today + d * DAY;
      const h = hoursFor(hours, new Date(dayStart).getUTCDay());
      if (!h) continue;
      for (let t = h.open; t + 60 <= h.close; t += 60) {
        const startsAt = new Date(dayStart + t * 60_000);
        if (startsAt <= now) continue;
        data.push({
          id: uuidv7(),
          storeId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR),
          capacity,
        });
      }
    }
    const res = await this.prisma.pickupSlot.createMany({ data, skipDuplicates: true });
    return res.count;
  }

  async generateAll(opts: { days?: number; now?: Date } = {}): Promise<number> {
    const stores = await this.prisma.store.findMany({
      where: { active: true },
      select: { id: true },
    });
    let total = 0;
    for (const s of stores) total += await this.generate(s.id, opts);
    return total;
  }
}
