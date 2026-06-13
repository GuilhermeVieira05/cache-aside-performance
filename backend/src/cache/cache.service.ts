import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export type CacheStatus = 'HIT' | 'MISS' | 'DISABLED' | 'ERROR';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const CACHE_STATS_SERVICE = 'CACHE_STATS_SERVICE';
export const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS ?? '300', 10);

export interface ICacheStatsService {
  incr(field: string, by?: number): Promise<void>;
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
    if (!this.isEnabled()) {
      const result = await loader();
      return [result, 'DISABLED'];
    }

    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        this.logger.log(`[CACHE HIT] key=${key}`);
        await this.stats?.incr('hits');
        return [JSON.parse(cached) as T, 'HIT'];
      }
    } catch (err) {
      this.logger.warn(
        `[CACHE ERROR] key=${key} redis read failed: ${(err as Error).message}`,
      );
      const result = await loader();
      return [result, 'ERROR'];
    }

    this.logger.log(`[CACHE MISS] key=${key}`);
    await this.stats?.incr('misses');

    const result = await loader();

    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', ttl);
    } catch (err) {
      this.logger.warn(
        `[CACHE ERROR] key=${key} redis write failed: ${(err as Error).message}`,
      );
    }

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
}
