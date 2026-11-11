import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { AuditService } from '../audit/audit.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';
import { NotificationsListener } from './notifications.listener';
import {
  BullNotificationsQueue,
  NOTIFICATIONS_QUEUE,
  type NotificationsQueue,
} from './notifications.queue';
import { NotificationsService } from './notifications.service';
import {
  EMAIL_PROVIDER,
  FakeEmailProvider,
  SmtpEmailProvider,
  type EmailProvider,
} from './providers/email.provider';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { FakePushProvider, PUSH_PROVIDER, type PushProvider } from './providers/push.provider';

@Module({
  imports: [DeliveryModule],
  controllers: [NotificationTemplatesController],
  providers: [
    NotificationsService,
    NotificationsListener,
    NotificationTemplatesService,
    {
      provide: NOTIFICATIONS_QUEUE,
      inject: [ENV],
      useFactory: (env: Env): NotificationsQueue => new BullNotificationsQueue(env.REDIS_URL),
    },
    {
      provide: PUSH_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): PushProvider => {
        if (env.PUSH_PROVIDER === 'expo') return new ExpoPushProvider(env.EXPO_ACCESS_TOKEN);
        if (env.NODE_ENV === 'production') {
          new Logger('Push').warn('PUSH_PROVIDER=fake en production : aucun push ne sera envoyé.');
        }
        return new FakePushProvider();
      },
    },
    {
      provide: EMAIL_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): EmailProvider => {
        if (env.EMAIL_PROVIDER === 'smtp')
          return new SmtpEmailProvider(env.SMTP_URL, env.EMAIL_FROM);
        if (env.NODE_ENV === 'production') {
          new Logger('Email').warn('EMAIL_PROVIDER=fake en production : aucune alerte envoyée.');
        }
        return new FakeEmailProvider();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly templates: NotificationTemplatesService,
  ) {}

  onModuleInit(): void {
    this.audit.registerLoader('notification-templates', () => this.templates.list());
  }
}
