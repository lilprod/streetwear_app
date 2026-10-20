import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvValidationError, parseEnv } from './config/env';
import { initSentry } from './config/sentry';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env);
  initSentry(env.SENTRY_DSN, env.NODE_ENV);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
