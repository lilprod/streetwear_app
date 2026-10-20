import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { NullZoneResolver, ZONE_RESOLVER } from './zone-resolver';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    NullZoneResolver,
    { provide: ZONE_RESOLVER, useExisting: NullZoneResolver },
  ],
  exports: [ZONE_RESOLVER],
})
export class UsersModule {}
