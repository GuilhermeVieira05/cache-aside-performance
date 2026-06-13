import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import type { Customer } from '../customers/customer.entity.js';
import type { OrderItem } from './order-item.entity.js';

export enum OrderStatus {
  pending = 0,
  processing = 1,
  shipped = 2,
  delivered = 3,
  cancelled = 4,
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @Column({ type: 'integer', default: 0 })
  status: number;

  @Column({
    name: 'total_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.0',
  })
  totalPrice: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', precision: 6 })
  updatedAt: Date;

  @ManyToOne('Customer', (customer: Customer) => customer.orders)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @OneToMany('OrderItem', (orderItem: OrderItem) => orderItem.order)
  orderItems: OrderItem[];

  @BeforeInsert()
  setCreatedAt() {
    const now = new Date();
    this.createdAt = now;
    this.updatedAt = now;
  }

  @BeforeUpdate()
  setUpdatedAt() {
    this.updatedAt = new Date();
  }

  recalculateTotal(): string {
    if (!this.orderItems || this.orderItems.length === 0) {
      this.totalPrice = '0.00';
      return this.totalPrice;
    }
    const total = this.orderItems.reduce((sum, item) => {
      return sum + item.quantity * parseFloat(item.unitPrice);
    }, 0);
    this.totalPrice = total.toFixed(2);
    return this.totalPrice;
  }
}
