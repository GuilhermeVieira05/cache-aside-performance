import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService, REDIS_CLIENT } from './cache.service.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
        return new Redis(redisUrl);
      },
    },
    CacheService,
  ],
  exports: [CacheService, REDIS_CLIENT],
})
export class CacheModule {}
