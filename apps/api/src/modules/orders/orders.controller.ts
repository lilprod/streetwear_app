import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminOrderCountsQuerySchema,
  AdminOrdersQuerySchema,
  CreateOrderInputSchema,
  IdempotencyKeySchema,
  PageQuerySchema,
  StatsQuerySchema,
  TransitionInputSchema,
} from '@streetwear/shared';
import type { Response } from 'express';
import { ApiException } from '../../common/api-exception';
import { UuidParam } from '../../common/uuid-param';
import { ZodPipe } from '../../common/zod.pipe';
import type { AdminPrincipal, CustomerPrincipal } from '../auth/auth.types';
import { CurrentAdmin, CurrentUser } from '../auth/current.decorators';
import { AdminAuthGuard, CustomerAuthGuard } from '../auth/guards';
import { Roles } from '../auth/roles.decorator';
import { OrdersService, type TransitionActor } from './orders.service';
import { renderReceipt } from './receipt';
import { StatsService } from './stats.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(CustomerAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @CurrentUser() me: CustomerPrincipal,
    @Body(new ZodPipe(CreateOrderInputSchema)) body: typeof CreateOrderInputSchema._output,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (key === undefined) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'L’en-tête Idempotency-Key est obligatoire.',
        {
          fieldErrors: { 'Idempotency-Key': ['En-tête obligatoire (UUID).'] },
        },
      );
    }
    const idempotencyKey = new ZodPipe(IdempotencyKeySchema).transform(key);
    return this.orders.create(me.id, body, idempotencyKey);
  }

  @Get()
  list(
    @CurrentUser() me: CustomerPrincipal,
    @Query(new ZodPipe(PageQuerySchema)) query: typeof PageQuerySchema._output,
  ) {
    return this.orders.list(me.id, query);
  }

  @Get(':id')
  get(@CurrentUser() me: CustomerPrincipal, @Param('id', UuidParam) id: string) {
    return this.orders.get(me.id, id);
  }

  @Get(':id/receipt.pdf')
  async receipt(
    @CurrentUser() me: CustomerPrincipal,
    @Param('id', UuidParam) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const order = await this.orders.forReceipt(me.id, id);
    const pdf = await renderReceipt(order);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="recu-${order.number}.pdf"`,
        'Cache-Control': 'private, no-store',
      })
      .send(pdf);
  }

  @Post(':id/reorder')
  @HttpCode(200)
  reorder(@CurrentUser() me: CustomerPrincipal, @Param('id', UuidParam) id: string) {
    return this.orders.reorder(me.id, id);
  }
}

const adminActor = (a: AdminPrincipal): TransitionActor => ({
  type: 'admin',
  role: a.role,
  id: a.id,
});

@ApiTags('admin-orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
@Roles('order_manager', 'production', 'logistics', 'super_admin')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query(new ZodPipe(AdminOrdersQuerySchema)) query: typeof AdminOrdersQuerySchema._output) {
    return this.orders.adminList(query);
  }

  @Get('counts')
  counts(
    @Query(new ZodPipe(AdminOrderCountsQuerySchema))
    query: typeof AdminOrderCountsQuerySchema._output,
  ) {
    return this.orders.adminCounts(query);
  }

  @Get(':id')
  get(@CurrentAdmin() admin: AdminPrincipal, @Param('id', UuidParam) id: string) {
    return this.orders.adminGet(id, adminActor(admin));
  }

  @Post(':id/transitions')
  @HttpCode(200)
  async transition(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(TransitionInputSchema)) body: typeof TransitionInputSchema._output,
  ) {
    await this.orders.adminTransition(id, body.to, adminActor(admin), body.note, body.code);
    return this.orders.adminGet(id, adminActor(admin));
  }
}

@ApiTags('admin-stats')
@ApiBearerAuth()
@Controller('admin/stats')
@UseGuards(AdminAuthGuard)
@Roles('order_manager', 'super_admin')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('summary')
  summary(@Query(new ZodPipe(StatsQuerySchema)) query: typeof StatsQuerySchema._output) {
    return this.stats.summary(query);
  }
}
