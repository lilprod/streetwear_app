import { Module } from '@nestjs/common';
import { ZonesModule } from '../delivery/zones.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ZonesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [ZonesModule],
})
export class UsersModule {}
