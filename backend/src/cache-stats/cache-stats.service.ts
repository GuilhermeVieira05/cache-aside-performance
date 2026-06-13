import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, ICacheStatsService } from '../cache/cache.service.js';

export interface StatsDto {
  hits: number;
  misses: number;
  hit_rate: number;
  invalidations: number;
  db_queries: number;
}

const HASH_KEY = 'cache_stats';

@Injectable()
export class CacheStatsService implements ICacheStatsService {
  private readonly logger = new Logger(CacheStatsService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async incr(field: string, by = 1): Promise<void> {
    try {
      await this.redis.hincrby(HASH_KEY, field, by);
    } catch (err) {
      this.logger.warn(`[CacheStats] incr failed: ${(err as Error).message}`);
    }
  }

  async all(): Promise<StatsDto> {
    try {
      const raw = await this.redis.hgetall(HASH_KEY);
      const hits = parseInt(raw.hits ?? '0', 10);
      const misses = parseInt(raw.misses ?? '0', 10);
      const total = hits + misses;
      const hitRate =
        total === 0 ? 0.0 : Math.round((hits / total) * 100 * 100) / 100;

      return {
        hits,
        misses,
        hit_rate: hitRate,
        invalidations: parseInt(raw.invalidations ?? '0', 10),
        db_queries: parseInt(raw.db_queries ?? '0', 10),
      };
    } catch (err) {
      this.logger.warn(`[CacheStats] all failed: ${(err as Error).message}`);
      return {
        hits: 0,
        misses: 0,
        hit_rate: 0.0,
        invalidations: 0,
        db_queries: 0,
      };
    }
  }

  async reset(): Promise<void> {
    try {
      await this.redis.del(HASH_KEY);
    } catch (err) {
      this.logger.warn(`[CacheStats] reset failed: ${(err as Error).message}`);
    }
  }
}
