import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller.js';
import { CacheStatsModule } from '../cache-stats/cache-stats.module.js';

@Module({
  imports: [CacheStatsModule],
  controllers: [StatsController],
})
export class StatsModule {}
