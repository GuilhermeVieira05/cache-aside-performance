import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, ICacheStatsService } from '../cache/cache.service.js';

export interface StatsDto {
  hits: number;
  misses: number;
  hit_rate: number;
  invalidations: number;
  db_queries: number;
  avg_ms_hit: number;
  avg_ms_miss: number;
  avg_ms_nocache: number;
  cnt_hit: number;
  cnt_miss: number;
  cnt_nocache: number;
}

export type TimingCategory = 'hit' | 'miss' | 'nocache';

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

  async recordTiming(category: TimingCategory, ms: number): Promise<void> {
    try {
      await this.redis.hincrbyfloat(HASH_KEY, `sum_ms_${category}`, ms);
      await this.redis.hincrby(HASH_KEY, `cnt_${category}`, 1);
    } catch (err) {
      this.logger.warn(`[CacheStats] recordTiming failed: ${(err as Error).message}`);
    }
  }

  async all(): Promise<StatsDto> {
    try {
      const raw = await this.redis.hgetall(HASH_KEY);
      const int = (k: string) => parseInt(raw[k] ?? '0', 10);
      const flt = (k: string) => parseFloat(raw[k] ?? '0');
      const hits = int('hits');
      const misses = int('misses');
      const total = hits + misses;
      const hitRate = total === 0 ? 0.0 : Math.round((hits / total) * 100 * 100) / 100;
      const avg = (cat: TimingCategory) => {
        const cnt = int(`cnt_${cat}`);
        return cnt === 0 ? 0.0 : Math.round((flt(`sum_ms_${cat}`) / cnt) * 10) / 10;
      };
      return {
        hits,
        misses,
        hit_rate: hitRate,
        invalidations: int('invalidations'),
        db_queries: int('db_queries'),
        avg_ms_hit: avg('hit'),
        avg_ms_miss: avg('miss'),
        avg_ms_nocache: avg('nocache'),
        cnt_hit: int('cnt_hit'),
        cnt_miss: int('cnt_miss'),
        cnt_nocache: int('cnt_nocache'),
      };
    } catch (err) {
      this.logger.warn(`[CacheStats] all failed: ${(err as Error).message}`);
      return {
        hits: 0, misses: 0, hit_rate: 0.0, invalidations: 0, db_queries: 0,
        avg_ms_hit: 0, avg_ms_miss: 0, avg_ms_nocache: 0,
        cnt_hit: 0, cnt_miss: 0, cnt_nocache: 0,
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
