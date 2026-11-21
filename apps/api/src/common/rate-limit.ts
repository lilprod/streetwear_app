import { createHash } from 'node:crypto';
import {
  type ExecutionContext,
  Logger,
  type OnApplicationShutdown,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle, type ThrottlerModuleOptions, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { Redis } from 'ioredis';

const SENSITIVE_FLAG = 'rate-limit:sensitive';

/** Limite spécifique d'une route (OTP, connexion admin) : compteur propre à la route, en plus de la limite globale. */
export const SensitiveThrottle = (
  limit: () => number,
  ttl = 60_000,
): MethodDecorator & ClassDecorator =>
  applyDecorators(Throttle({ sensitive: { limit, ttl } }), SetMetadata(SENSITIVE_FLAG, true));

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const INCR_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { hits, redis.call('PTTL', KEYS[1]) }
`;

/** Compteurs partagés entre instances (Redis) ; en cas de panne Redis, la limite est levée (l'API reste disponible). */
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly logger = new Logger('RateLimit');
  private lastWarn = 0;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
      enableOfflineQueue: true,
    });
    this.redis.on('error', () => undefined);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const [hits, pttl] = (await this.redis.eval(
        INCR_LUA,
        1,
        `throttle:${throttlerName}:${key}`,
        String(ttl),
      )) as [number, number];
      const seconds = Math.max(1, Math.ceil(pttl / 1000));
      return {
        totalHits: hits,
        timeToExpire: seconds,
        isBlocked: hits > limit,
        timeToBlockExpire: seconds,
      };
    } catch {
      if (Date.now() - this.lastWarn > 60_000) {
        this.lastWarn = Date.now();
        this.logger.error('Redis indisponible : limitation de débit suspendue.');
      }
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

export function throttlerOptions(env: {
  REDIS_URL: string;
  RATE_LIMIT_PER_MINUTE: number;
}): ThrottlerModuleOptions {
  const reflector = new Reflector();
  return {
    throttlers: [
      { name: 'global', ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE },
      {
        name: 'sensitive',
        ttl: 60_000,
        limit: env.RATE_LIMIT_PER_MINUTE,
        skipIf: (ctx: ExecutionContext) =>
          !reflector.getAllAndOverride<boolean>(SENSITIVE_FLAG, [ctx.getHandler(), ctx.getClass()]),
      },
    ],
    storage: new RedisThrottlerStorage(env.REDIS_URL),
    generateKey: (ctx, tracker, name) =>
      name === 'global'
        ? sha(`global:${tracker}`)
        : sha(`${ctx.getClass().name}-${ctx.getHandler().name}-${name}-${tracker}`),
  };
}
