import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { RedisService } from '../infrastructure/redis/redis.service';
import type { ReadyHealthDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadyHealthDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
      `;
      if (!rows[0] || rows[0].count < 1n) throw new Error('required migrations are not applied');
      if ((await this.redis.ping()) !== 'PONG') throw new Error('Redis did not return PONG');

      return {
        status: 'ok',
        checks: { database: 'up', migrations: 'up', redis: 'up' },
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable',
      });
    }
  }
}
