import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './customer.entity.js';
import { CacheService, DEFAULT_TTL, CacheStatus } from '../cache/cache.service.js';

export interface CustomerDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCustomerBody {
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
}

export interface UpdateCustomerBody {
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
}

function toDto(c: Customer): CustomerDto {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    address: c.address ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function validateCustomerParams(params: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}): string[] {
  const errors: string[] = [];

  if (!params.name || params.name.trim() === '') {
    errors.push("Name can't be blank");
  }

  if (!params.email || params.email.trim() === '') {
    errors.push("Email can't be blank");
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(params.email)) {
      errors.push('Email is invalid');
    }
  }

  if (params.phone !== undefined && params.phone !== null && params.phone !== '') {
    const phoneRegex = /^[\d\s\-()+]+$/;
    if (!phoneRegex.test(params.phone)) {
      errors.push('Phone is invalid');
    }
  }

  return errors;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    private readonly cache: CacheService,
  ) {}

  async findAll(): Promise<[CustomerDto[], CacheStatus]> {
    const [result, status] = await this.cache.fetch<CustomerDto[]>(
      'customers:all',
      DEFAULT_TTL,
      async () => {
        const customers = await this.repo.find({ order: { id: 'ASC' } });
        return customers.map(toDto);
      },
    );
    return [result, status];
  }

  async findOne(id: string): Promise<[CustomerDto, CacheStatus]> {
    return this.cache.fetch<CustomerDto>(`customers:${id}`, DEFAULT_TTL, async () => {
      const customer = await this.repo.findOne({ where: { id } });
      if (!customer) throw new NotFoundException('Customer not found');
      return toDto(customer);
    });
  }

  async create(body: CreateCustomerBody): Promise<CustomerDto> {
    const params = body.customer ?? {};
    const errors = validateCustomerParams(params);
    if (errors.length > 0) {
      throw new HttpException({ errors }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const customer = this.repo.create({
      name: params.name!,
      email: params.email!,
      phone: params.phone ?? null,
      address: params.address ?? null,
    });

    try {
      await this.repo.save(customer);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new HttpException(
          { errors: ['Email has already been taken'] },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw err;
    }

    await this.cache.invalidate('customers:all');
    return toDto(customer);
  }

  async update(id: string, body: UpdateCustomerBody): Promise<CustomerDto> {
    const customer = await this.repo.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const params = body.customer ?? {};
    const merged = {
      name: params.name !== undefined ? params.name : customer.name,
      email: params.email !== undefined ? params.email : customer.email,
      phone: params.phone !== undefined ? params.phone : customer.phone ?? undefined,
      address: params.address !== undefined ? params.address : customer.address ?? undefined,
    };

    const errors = validateCustomerParams(merged);
    if (errors.length > 0) {
      throw new HttpException({ errors }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    if (params.name !== undefined) customer.name = params.name;
    if (params.email !== undefined) customer.email = params.email;
    if (params.phone !== undefined) customer.phone = params.phone;
    if (params.address !== undefined) customer.address = params.address;

    try {
      await this.repo.save(customer);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new HttpException(
          { errors: ['Email has already been taken'] },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw err;
    }

    await this.cache.invalidate('customers:all', `customers:${customer.id}`);
    return toDto(customer);
  }

  async remove(id: string): Promise<void> {
    const customer = await this.repo.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }
    await this.repo.remove(customer);
    await this.cache.invalidate('customers:all', `customers:${id}`);
  }
}
