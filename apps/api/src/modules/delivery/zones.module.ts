import { Module } from '@nestjs/common';
import { ZONE_RESOLVER } from '../users/zone-resolver';
import { ZonesService } from './zones.service';

@Module({
  providers: [ZonesService, { provide: ZONE_RESOLVER, useExisting: ZonesService }],
  exports: [ZonesService, ZONE_RESOLVER],
})
export class ZonesModule {}
