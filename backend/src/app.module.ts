import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CacheModule } from './cache/cache.module.js';
import { CacheStatsModule } from './cache-stats/cache-stats.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { ProductsModule } from './products/products.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { StatsModule } from './stats/stats.module.js';
import { CacheStatusModule } from './cache-status/cache-status.module.js';
import { ObservabilityModule } from './observability/observability.module.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [join(__dirname, '**', '*.entity.{ts,js}')],
      migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
      synchronize: false,
      logging: false,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: [
        '/api*',
        '/customers*',
        '/products*',
        '/orders*',
        '/stats*',
        '/cache-stats*',
        '/cache*',
        '/observability*',
      ],
    }),
    CacheModule,
    CacheStatsModule,
    CustomersModule,
    ProductsModule,
    OrdersModule,
    StatsModule,
    CacheStatusModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
