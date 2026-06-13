import { Controller, Get, Post, HttpCode } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';

@Controller('cache')
export class CacheStatusController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('status')
  status() {
    return { enabled: this.cacheService.isEnabled() };
  }

  @Post('toggle')
  @HttpCode(200)
  toggle() {
    this.cacheService.toggle();
    return { enabled: this.cacheService.isEnabled() };
  }
}
