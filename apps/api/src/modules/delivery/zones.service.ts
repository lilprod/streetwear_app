import { Injectable } from '@nestjs/common';
import type { DeliveryZoneSummary } from '@streetwear/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { ZoneResolver } from '../users/zone-resolver';
import { GeoPolygonSchema, geoArea, pointInGeo } from './geo';

const summary = (z: {
  id: string;
  name: string;
  feeXof: number;
  delayHours: number;
}): DeliveryZoneSummary => ({
  id: z.id,
  name: z.name,
  feeXof: z.feeXof,
  delayHours: z.delayHours,
});

@Injectable()
export class ZonesService implements ZoneResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** Zone active la plus petite contenant le point (les zones peuvent s'imbriquer). */
  async resolve(lat: number, lng: number): Promise<DeliveryZoneSummary | null> {
    const zones = await this.prisma.deliveryZone.findMany({ where: { active: true } });
    let best: { zone: (typeof zones)[number]; area: number } | null = null;
    for (const zone of zones) {
      const parsed = GeoPolygonSchema.safeParse(zone.polygon);
      if (!parsed.success || !pointInGeo(lat, lng, parsed.data)) continue;
      const area = geoArea(parsed.data);
      if (!best || area < best.area) best = { zone, area };
    }
    return best ? summary(best.zone) : null;
  }

  async summarize(zoneId: string): Promise<DeliveryZoneSummary | null> {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    return zone ? summary(zone) : null;
  }
}
