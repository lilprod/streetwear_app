import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  AdminPaymentsQuerySchema,
  CreatePaymentInputSchema,
  IdempotencyKeySchema,
  ReconciliationsQuerySchema,
} from '@streetwear/shared';
import type { Request } from 'express';
import { ApiException } from '../../common/api-exception';
import { UuidParam } from '../../common/uuid-param';
import { ZodPipe } from '../../common/zod.pipe';
import type { CustomerPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/current.decorators';
import { AdminAuthGuard, CustomerAuthGuard } from '../auth/guards';
import { Roles } from '../auth/roles.decorator';
import { PaymentsService } from './payments.service';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
@UseGuards(CustomerAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:id/payments')
  create(
    @CurrentUser() me: CustomerPrincipal,
    @Param('id', UuidParam) orderId: string,
    @Body(new ZodPipe(CreatePaymentInputSchema)) body: typeof CreatePaymentInputSchema._output,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (key === undefined) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'L’en-tête Idempotency-Key est obligatoire.',
        { fieldErrors: { 'Idempotency-Key': ['En-tête obligatoire (UUID).'] } },
      );
    }
    const idempotencyKey = new ZodPipe(IdempotencyKeySchema).transform(key);
    return this.payments.create(me.id, orderId, body, idempotencyKey);
  }

  @Get('payments/:id')
  status(@CurrentUser() me: CustomerPrincipal, @Param('id', UuidParam) id: string) {
    return this.payments.status(me.id, id);
  }
}

/** Public, signé par l'agrégateur ; corps brut fourni par `rawBodyMiddleware`. */
@ApiTags('webhooks')
@Controller('webhooks/payments')
@SkipThrottle()
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':provider')
  @HttpCode(200)
  async receive(@Param('provider') provider: string, @Req() req: Request) {
    await this.payments.handleWebhook(provider, req.headers, req.body);
    return { received: true };
  }
}

@ApiTags('admin-payments')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminAuthGuard)
@Roles('order_manager', 'super_admin')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly reconciliations: ReconciliationService,
  ) {}

  @Get('payments')
  list(
    @Query(new ZodPipe(AdminPaymentsQuerySchema)) query: typeof AdminPaymentsQuerySchema._output,
  ) {
    return this.payments.adminList(query);
  }

  @Get('reconciliations')
  listReconciliations(
    @Query(new ZodPipe(ReconciliationsQuerySchema))
    query: typeof ReconciliationsQuerySchema._output,
  ) {
    return this.reconciliations.list(query);
  }
}
