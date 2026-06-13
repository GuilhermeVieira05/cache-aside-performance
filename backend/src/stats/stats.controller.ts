import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { CacheStatsService } from '../cache-stats/cache-stats.service.js';

@Controller('stats')
export class StatsController {
  constructor(private readonly cacheStats: CacheStatsService) {}

  @Get()
  async show() {
    return this.cacheStats.all();
  }

  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset() {
    await this.cacheStats.reset();
  }
}
