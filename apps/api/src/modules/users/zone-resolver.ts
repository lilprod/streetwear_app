import { Injectable } from '@nestjs/common';
import type { DeliveryZoneSummary } from '@streetwear/shared';

/** Implémentée par SP06 (résolution point dans polygone). */
export interface ZoneResolver {
  resolve(lat: number, lng: number): Promise<DeliveryZoneSummary | null>;
  summarize(zoneId: string): Promise<DeliveryZoneSummary | null>;
}

export const ZONE_RESOLVER = Symbol('ZONE_RESOLVER');

@Injectable()
export class NullZoneResolver implements ZoneResolver {
  async resolve(): Promise<null> {
    return null;
  }

  async summarize(): Promise<null> {
    return null;
  }
}
