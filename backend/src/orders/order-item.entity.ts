import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import type { Order } from './order.entity.js';
import type { Product } from '../products/product.entity.js';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 10, scale: 2 })
  unitPrice: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', precision: 6 })
  updatedAt: Date;

  @BeforeInsert()
  setCreatedAt() {
    const now = new Date();
    this.createdAt = now;
    this.updatedAt = now;
  }

  @ManyToOne('Order', (order: Order) => order.orderItems)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne('Product', (product: Product) => product.orderItems)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
