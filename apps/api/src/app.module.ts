import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdminCatalogModule } from './admin-catalog/admin-catalog.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuthModule } from './common/auth/auth.module';
import { ENV, parseEnv } from './config/env';
import { DesignsModule } from './designs/designs.module';
import { MediaModule } from './media/media.module';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      forRoutes: ['{*path}'],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: process.env.NODE_ENV !== 'test',
      },
    }),
    AuthModule,
    MediaModule,
    CatalogModule,
    DesignsModule,
    AdminCatalogModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: ENV, useFactory: () => parseEnv(process.env) },
    PrismaService,
    RedisService,
  ],
  exports: [ENV, PrismaService, RedisService],
})
export class AppModule {}
