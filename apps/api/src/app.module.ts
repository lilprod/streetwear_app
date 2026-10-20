import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ENV, parseEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffRouteGuard } from './modules/auth/staff-route.guard';
import { SettingsModule } from './modules/settings/settings.module';
import { SmsModule } from './modules/sms/sms.module';
import { UsersModule } from './modules/users/users.module';
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
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: 60_000, limit: parseEnv(process.env).RATE_LIMIT_PER_MINUTE }],
    }),
    SmsModule,
    AuthModule,
    AuditModule,
    SettingsModule,
    UsersModule,
    AdminUsersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: ENV, useFactory: () => parseEnv(process.env) },
    PrismaService,
    RedisService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: StaffRouteGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [ENV, PrismaService, RedisService],
})
export class AppModule {}
