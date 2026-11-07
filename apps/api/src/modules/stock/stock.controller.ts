import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockMovementInputSchema, StockThresholdInputSchema } from '@streetwear/shared';
import { UuidParam } from '../../common/uuid-param';
import { ZodPipe } from '../../common/zod.pipe';
import type { AdminPrincipal } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current.decorators';
import { AdminAuthGuard } from '../auth/guards';
import { Roles } from '../auth/roles.decorator';
import { StockService } from './stock.service';

@ApiTags('admin-stock')
@ApiBearerAuth()
@Controller('admin/stock')
@UseGuards(AdminAuthGuard)
@Roles('production', 'super_admin')
export class StockAdminController {
  constructor(private readonly stock: StockService) {}

  @Get()
  list() {
    return this.stock.list();
  }

  @Post('movements')
  move(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body(new ZodPipe(StockMovementInputSchema)) body: typeof StockMovementInputSchema._output,
  ) {
    return this.stock.move(body, admin.id);
  }

  @Patch(':id')
  threshold(
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(StockThresholdInputSchema)) body: typeof StockThresholdInputSchema._output,
  ) {
    return this.stock.setThreshold(id, body.alertThreshold);
  }
}
