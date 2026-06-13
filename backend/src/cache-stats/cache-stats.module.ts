import { Global, Module } from '@nestjs/common';
import { CACHE_STATS_SERVICE } from '../cache/cache.service.js';
import { CacheStatsService } from './cache-stats.service.js';

@Global()
@Module({
  providers: [
    CacheStatsService,
    {
      provide: CACHE_STATS_SERVICE,
      useExisting: CacheStatsService,
    },
  ],
  exports: [
    CacheStatsService,
    {
      provide: CACHE_STATS_SERVICE,
      useExisting: CacheStatsService,
    },
  ],
})
export class CacheStatsModule {}
