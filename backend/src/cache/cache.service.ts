import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export type CacheStatus = 'HIT' | 'MISS' | 'DISABLED' | 'ERROR';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const CACHE_STATS_SERVICE = 'CACHE_STATS_SERVICE';
export const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS ?? '300', 10);

export interface ICacheStatsService {
  incr(field: string, by?: number): Promise<void>;
  recordTiming(category: 'hit' | 'miss' | 'nocache', ms: number): Promise<void>;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private overrideEnabled: boolean | undefined = undefined;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional()
    @Inject(CACHE_STATS_SERVICE)
    private readonly stats: ICacheStatsService | null,
  ) {}

  isEnabled(): boolean {
    if (this.overrideEnabled !== undefined) {
      return this.overrideEnabled;
    }
    return (process.env.CACHE_ENABLED ?? 'true') === 'true';
  }

  toggle(): void {
    this.overrideEnabled = !this.isEnabled();
  }

  async fetch<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<[T, CacheStatus]> {
    const start = performance.now();

    if (!this.isEnabled()) {
      const result = await loader();
      const elapsed = performance.now() - start;
      await this.stats?.incr('db_queries');
      await this.stats?.recordTiming('nocache', elapsed);
      return [result, 'DISABLED'];
    }

    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        const parsed = JSON.parse(cached) as T;
        const elapsed = performance.now() - start;
        this.logger.log(`[CACHE HIT] key=${key}`);
        await this.stats?.incr('hits');
        await this.stats?.recordTiming('hit', elapsed);
        return [parsed, 'HIT'];
      }
    } catch (err) {
      this.logger.warn(
        `[CACHE ERROR] key=${key} redis read failed: ${(err as Error).message}`,
      );
      const result = await loader();
      await this.stats?.incr('db_queries');
      return [result, 'ERROR'];
    }

    this.logger.log(`[CACHE MISS] key=${key}`);
    await this.stats?.incr('misses');

    const result = await loader();
    await this.stats?.incr('db_queries');

    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', ttl);
    } catch (err) {
      this.logger.warn(
        `[CACHE ERROR] key=${key} redis write failed: ${(err as Error).message}`,
      );
    }

    const elapsed = performance.now() - start;
    await this.stats?.recordTiming('miss', elapsed);
    return [result, 'MISS'];
  }

  async invalidate(...keys: string[]): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    for (const key of keys) {
      try {
        await this.redis.del(key);
        this.logger.log(`[CACHE INVALIDATE] key=${key}`);
      } catch (err) {
        this.logger.warn(
          `[CACHE ERROR] key=${key} redis del failed: ${(err as Error).message}`,
        );
      }
    }

    if (keys.length > 0) {
      await this.stats?.incr('invalidations', keys.length);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isEnabled()) {
      return 0;
    }

    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await this.redis.del(...keys);
        deleted += keys.length;
        for (const k of keys) {
          this.logger.log(`[CACHE INVALIDATE] key=${k}`);
        }
      }
    } while (cursor !== '0');

    if (deleted > 0) {
      await this.stats?.incr('invalidations', deleted);
    }
    return deleted;
  }
}
