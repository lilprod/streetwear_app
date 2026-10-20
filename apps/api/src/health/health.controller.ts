import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type Probe = 'ok' | 'error';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'ok'; redis: 'ok' }> {
    const db = await this.probe(() => this.prisma.$queryRaw`SELECT 1`);
    const redis = await this.probe(async () => {
      if (this.redis.status === 'wait') await this.redis.connect();
      await this.redis.ping();
    });
    if (db === 'ok' && redis === 'ok') return { status: 'ok', db, redis };
    throw new HttpException(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Un service est indisponible.',
        details: { db, redis },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private async probe(fn: () => Promise<unknown>): Promise<Probe> {
    try {
      await fn();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
