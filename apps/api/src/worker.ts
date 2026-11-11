import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvValidationError, parseEnv } from './config/env';
import { initSentry } from './config/sentry';
import { startSlotGeneration } from './modules/delivery/slot-generation.queue';
import { startRenderWorker } from './modules/production/render/render.queue';
import { startOrdersExpiry } from './modules/orders/orders-expire.queue';
import { startNotificationsWorker } from './modules/notifications/notifications.worker';
import { startPaymentsReconcile } from './modules/payments/payments-reconcile.queue';

async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env);
  initSentry(env.SENTRY_DSN, env.NODE_ENV);
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  startSlotGeneration(app, env.REDIS_URL);
  startOrdersExpiry(app, env.REDIS_URL);
  startRenderWorker(app, env.REDIS_URL);
  startPaymentsReconcile(app, env.REDIS_URL);
  startNotificationsWorker(app, env.REDIS_URL);
  app
    .get(Logger)
    .log(
      'Worker démarré (files : slot-generation, orders-expire, render-print-files, payments-reconcile, notifications)',
    );
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof EnvValidationError ? err.message : err);
  process.exit(1);
});
