import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvValidationError, parseEnv } from './config/env';
import { initSentry } from './config/sentry';

async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env);
  initSentry(env.SENTRY_DSN, env.NODE_ENV);
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Worker démarré (aucune file enregistrée)');
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof EnvValidationError ? err.message : err);
  process.exit(1);
});
