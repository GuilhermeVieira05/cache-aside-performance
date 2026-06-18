import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity.js';
import { CacheService, DEFAULT_TTL, CacheStatus } from '../cache/cache.service.js';
import { Paginated, PageParams, pageCacheKey, buildPaginated } from '../common/pagination.js';

export interface ProductDto {
  id: string;
  name: string;
  description: string | null;
  price: string;
  stock_quantity: number;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductBody {
  product: {
    name?: string;
    description?: string;
    price?: string | number;
    stock_quantity?: number;
    category?: string;
  };
}

export interface UpdateProductBody {
  product: {
    name?: string;
    description?: string;
    price?: string | number;
    stock_quantity?: number;
    category?: string;
  };
}

function toDto(p: Product): ProductDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    price: p.price,
    stock_quantity: p.stockQuantity,
    category: p.category ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function validateProductParams(params: {
  name?: string;
  price?: string | number;
  stock_quantity?: number;
}): string[] {
  const errors: string[] = [];

  if (!params.name || String(params.name).trim() === '') {
    errors.push("Name can't be blank");
  }

  if (params.price === undefined || params.price === null || String(params.price).trim() === '') {
    errors.push("Price can't be blank");
  } else {
    const priceVal = parseFloat(String(params.price));
    if (isNaN(priceVal) || priceVal <= 0) {
      errors.push('Price must be a positive number');
    }
  }

  if (params.stock_quantity === undefined || params.stock_quantity === null) {
    errors.push("Stock quantity can't be blank");
  } else {
    const qty = Number(params.stock_quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      errors.push('Stock quantity must be a non-negative integer');
    }
  }

  return errors;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    private readonly cache: CacheService,
  ) {}

  async findAll(params: PageParams): Promise<[Paginated<ProductDto>, CacheStatus]> {
    const key = pageCacheKey('products', params);
    return this.cache.fetch<Paginated<ProductDto>>(key, DEFAULT_TTL, async () => {
      const [products, total] = await this.repo.findAndCount({
        order: { id: 'ASC' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      });
      return buildPaginated(products.map(toDto), total, params);
    });
  }

  async findOne(id: string): Promise<[ProductDto, CacheStatus]> {
    return this.cache.fetch<ProductDto>(`products:${id}`, DEFAULT_TTL, async () => {
      const product = await this.repo.findOne({ where: { id } });
      if (!product) throw new NotFoundException('Product not found');
      return toDto(product);
    });
  }

  async create(body: CreateProductBody): Promise<ProductDto> {
    const params = body.product ?? {};
    const errors = validateProductParams({
      name: params.name,
      price: params.price,
      stock_quantity: params.stock_quantity,
    });
    if (errors.length > 0) {
      throw new HttpException({ errors }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const product = this.repo.create({
      name: params.name!,
      description: params.description ?? null,
      price: String(params.price!),
      stockQuantity: Number(params.stock_quantity!),
      category: params.category ?? null,
    });

    await this.repo.save(product);
    await this.cache.invalidatePattern('products:page:*');
    return toDto(product);
  }

  async update(id: string, body: UpdateProductBody): Promise<ProductDto> {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const params = body.product ?? {};
    const merged = {
      name: params.name !== undefined ? params.name : product.name,
      price: params.price !== undefined ? params.price : product.price,
      stock_quantity:
        params.stock_quantity !== undefined ? params.stock_quantity : product.stockQuantity,
    };

    const errors = validateProductParams(merged);
    if (errors.length > 0) {
      throw new HttpException({ errors }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    if (params.name !== undefined) product.name = params.name;
    if (params.description !== undefined) product.description = params.description ?? null;
    if (params.price !== undefined) product.price = String(params.price);
    if (params.stock_quantity !== undefined) product.stockQuantity = Number(params.stock_quantity);
    if (params.category !== undefined) product.category = params.category ?? null;

    await this.repo.save(product);
    await this.cache.invalidatePattern('products:page:*');
    await this.cache.invalidate(`products:${product.id}`);
    return toDto(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product not found`);
    }
    await this.repo.remove(product);
    await this.cache.invalidatePattern('products:page:*');
    await this.cache.invalidate(`products:${id}`);
  }
}
