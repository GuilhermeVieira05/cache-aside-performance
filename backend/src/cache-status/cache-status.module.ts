import { Module } from '@nestjs/common';
import { CacheStatusController } from './cache-status.controller.js';

@Module({
  controllers: [CacheStatusController],
})
export class CacheStatusModule {}
