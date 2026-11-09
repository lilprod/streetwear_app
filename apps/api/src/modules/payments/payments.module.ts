import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import {
  AdminPaymentsController,
  PaymentWebhooksController,
  PaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDERS, type PaymentProviders } from './providers/payment-provider';
import { createPaymentProviders } from './providers/providers.factory';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, PaymentWebhooksController, AdminPaymentsController],
  providers: [
    { provide: PAYMENT_PROVIDERS, useFactory: () => createPaymentProviders(process.env) },
    PaymentsService,
    ReconciliationService,
  ],
  exports: [PaymentsService, ReconciliationService, PAYMENT_PROVIDERS],
})
export class PaymentsModule implements OnModuleDestroy {
  constructor(@Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProviders) {}

  async onModuleDestroy(): Promise<void> {
    for (const p of this.providers.all()) {
      const closable = p as { close?: () => Promise<void> };
      await closable.close?.();
    }
  }
}
