import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { WEBHOOKS_PATH, rawBodyMiddleware } from './modules/payments/raw-body.middleware';

export function setupApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.use(WEBHOOKS_PATH, rawBodyMiddleware);
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Streetwear API').setVersion('0.0.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('v1/docs', app, doc);
}
