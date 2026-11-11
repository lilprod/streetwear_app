import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AdminRole } from '@prisma/client';
import { formatXof } from '@streetwear/shared';
import {
  EVENTS,
  PAYMENT_EVENTS,
  type OrderExpiredEvent,
  type OrderStatusChangedEvent,
  type PaymentAmountMismatchEvent,
  type PaymentUnexpectedSuccessEvent,
  type ReconciliationMismatchEvent,
  type StockBelowThresholdEvent,
} from '../../common/events';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { PRODUCTION_EVENTS, type RenderFailedEvent } from '../production/production.events';
import {
  NOTIFICATIONS_QUEUE,
  type NotificationJob,
  type NotificationsQueue,
} from './notifications.queue';
import { STATUS_LABEL, STATUS_TEMPLATE_KEY } from './templates';

/**
 * Les écouteurs ne font qu'enfiler un job : aucune erreur (Redis, base) ne remonte à l'émetteur,
 * donc une panne de notification ne bloque jamais une transition. Aucune charge utile n'est journalisée.
 */
@Injectable()
export class NotificationsListener implements OnModuleDestroy {
  private readonly logger = new Logger('NotificationsListener');

  constructor(
    @Inject(NOTIFICATIONS_QUEUE) private readonly queue: NotificationsQueue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close?.();
  }

  private async enqueue(
    label: string,
    build: () => Promise<NotificationJob | null> | NotificationJob | null,
  ): Promise<void> {
    try {
      const job = await build();
      if (job) await this.queue.enqueue(job);
    } catch {
      this.logger.error(`Mise en file de la notification impossible (${label})`);
    }
  }

  @OnEvent(EVENTS.orderStatusChanged)
  onStatusChanged(e: OrderStatusChangedEvent): Promise<void> {
    return this.enqueue(`order.status_changed:${e.to}`, () =>
      STATUS_TEMPLATE_KEY[e.to]
        ? {
            kind: 'order',
            orderId: e.orderId,
            userId: e.userId,
            orderNumber: e.number,
            status: e.to,
          }
        : null,
    );
  }

  /** Même clé d'idempotence que `order.status_changed` vers `expired` : un seul push. */
  @OnEvent(EVENTS.orderExpired)
  onExpired(e: OrderExpiredEvent): Promise<void> {
    return this.enqueue('order.expired', () => ({
      kind: 'order',
      orderId: e.orderId,
      userId: e.userId,
      orderNumber: e.number,
      status: 'expired',
    }));
  }

  private alert(
    key: string,
    roles: AdminRole[],
    variables: Record<string, string>,
  ): NotificationJob {
    return { kind: 'alert', alertId: uuidv7(), key, roles, variables };
  }

  @OnEvent(EVENTS.stockBelowThreshold)
  onStockBelowThreshold(e: StockBelowThresholdEvent): Promise<void> {
    return this.enqueue(EVENTS.stockBelowThreshold, async () => {
      const color = await this.prisma.tshirtColor.findUnique({
        where: { id: e.colorId },
        select: { name: true },
      });
      return this.alert('stock.below_threshold', ['production'], {
        color: color?.name ?? e.colorId,
        size: e.size,
        available: String(e.available),
        alertThreshold: String(e.alertThreshold),
      });
    });
  }

  @OnEvent(PRODUCTION_EVENTS.renderFailed)
  onRenderFailed(e: RenderFailedEvent): Promise<void> {
    return this.enqueue(PRODUCTION_EVENTS.renderFailed, () =>
      this.alert('production.render_failed', ['production'], {
        orderNumber: e.orderNumber,
        errorCode: e.code,
      }),
    );
  }

  @OnEvent(PAYMENT_EVENTS.amountMismatch)
  onAmountMismatch(e: PaymentAmountMismatchEvent): Promise<void> {
    return this.enqueue(PAYMENT_EVENTS.amountMismatch, () =>
      this.alert('payment.amount_mismatch', ['order_manager'], {
        orderNumber: e.orderNumber,
        provider: e.provider,
        expectedXof: formatXof(e.expectedXof),
        receivedXof: formatXof(e.receivedXof),
      }),
    );
  }

  @OnEvent(PAYMENT_EVENTS.unexpectedSuccess)
  onUnexpectedSuccess(e: PaymentUnexpectedSuccessEvent): Promise<void> {
    return this.enqueue(PAYMENT_EVENTS.unexpectedSuccess, () =>
      this.alert('payment.unexpected_success', ['order_manager'], {
        orderNumber: e.orderNumber,
        provider: e.provider,
        amountXof: formatXof(e.amountXof),
        orderStatus: STATUS_LABEL[e.orderStatus] ?? e.orderStatus,
      }),
    );
  }

  @OnEvent(PAYMENT_EVENTS.reconciliationMismatch)
  onReconciliationMismatch(e: ReconciliationMismatchEvent): Promise<void> {
    return this.enqueue(PAYMENT_EVENTS.reconciliationMismatch, () =>
      this.alert('reconciliation.mismatch', ['order_manager'], {
        date: e.date,
        provider: e.provider,
        matched: String(e.matched),
        mismatchCount: String(e.mismatchCount),
      }),
    );
  }
}
