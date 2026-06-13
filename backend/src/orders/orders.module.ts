import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Product } from '../products/product.entity.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Product])],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
