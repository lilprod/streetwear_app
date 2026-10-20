import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV, parseEnv } from './config/env';
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
