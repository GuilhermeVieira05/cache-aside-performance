import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './order.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Product } from '../products/product.entity.js';
import { CacheService, DEFAULT_TTL, CacheStatus } from '../cache/cache.service.js';
import { Paginated, PageParams, pageCacheKey, buildPaginated } from '../common/pagination.js';

export interface OrderItemDto {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
}

export interface OrderDto {
  id: string;
  customer_id: string;
  status: string;
  total_price: string;
  created_at: Date;
  updated_at: Date;
  order_items: OrderItemDto[];
}

export interface CreateOrderBody {
  customer_id?: string;
  status?: number;
  order_items_attributes?: Array<{
    product_id?: string;
    quantity?: number;
  }>;
}

export interface UpdateOrderBody {
  status?: number;
}

function itemToDto(item: OrderItem): OrderItemDto {
  return {
    id: item.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  };
}

function toDto(order: Order): OrderDto {
  return {
    id: order.id,
    customer_id: order.customerId,
    status: OrderStatus[order.status] as keyof typeof OrderStatus,
    total_price: order.totalPrice,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    order_items: (order.orderItems ?? []).map(itemToDto),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly cache: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(params: PageParams): Promise<[Paginated<OrderDto>, CacheStatus]> {
    const key = pageCacheKey('orders', params);
    return this.cache.fetch<Paginated<OrderDto>>(key, DEFAULT_TTL, async () => {
      const [orders, total] = await this.orderRepo.findAndCount({
        order: { id: 'ASC' },
        relations: { orderItems: true },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      });
      return buildPaginated(orders.map(toDto), total, params);
    });
  }

  async findOne(id: string): Promise<[OrderDto, CacheStatus]> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: { orderItems: true },
    });
    if (!order) {
      throw new NotFoundException(`Order not found`);
    }
    const [result, status] = await this.cache.fetch<OrderDto>(
      `orders:${order.id}`,
      DEFAULT_TTL,
      async () => toDto(order),
    );
    return [result, status];
  }

  async create(body: CreateOrderBody): Promise<OrderDto> {
    const errors: string[] = [];

    if (!body.customer_id || String(body.customer_id).trim() === '') {
      errors.push("Customer can't be blank");
    }
    if (!body.order_items_attributes || body.order_items_attributes.length === 0) {
      errors.push("Order items can't be blank");
    }
    if (errors.length > 0) {
      throw new HttpException({ errors }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const order = await this.dataSource.transaction(async (manager) => {
      const newOrder = manager.create(Order, {
        customerId: String(body.customer_id!),
        status: body.status ?? 0,
        totalPrice: '0.00',
      });
      await manager.save(newOrder);

      const items: OrderItem[] = [];
      for (const itemAttr of body.order_items_attributes!) {
        if (!itemAttr.product_id) {
          throw new HttpException(
            { errors: ["Product can't be blank in order item"] },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        const product = await manager.findOne(Product, {
          where: { id: String(itemAttr.product_id) },
        });
        if (!product) {
          throw new NotFoundException(`Product ${itemAttr.product_id} not found`);
        }

        const orderItem = manager.create(OrderItem, {
          orderId: newOrder.id,
          productId: product.id,
          quantity: Number(itemAttr.quantity ?? 1),
          unitPrice: product.price,
        });
        await manager.save(orderItem);
        items.push(orderItem);
      }

      newOrder.orderItems = items;
      newOrder.recalculateTotal();
      await manager.save(newOrder);

      return newOrder;
    });

    await this.cache.invalidatePattern('orders:page:*');
    return toDto(order);
  }

  async update(id: string, body: UpdateOrderBody): Promise<OrderDto> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: { orderItems: true },
    });
    if (!order) {
      throw new NotFoundException(`Order not found`);
    }

    if (body.status !== undefined) {
      order.status = Number(body.status);
    }

    await this.orderRepo.save(order);
    await this.cache.invalidatePattern('orders:page:*');
    await this.cache.invalidate(`orders:${order.id}`);
    return toDto(order);
  }

  async remove(id: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order not found`);
    }
    await this.orderRepo.remove(order);
    await this.cache.invalidatePattern('orders:page:*');
    await this.cache.invalidate(`orders:${id}`);
  }
}
