import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Query,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { CreateProductBody, UpdateProductBody } from './products.service.js';
import { ProductsService } from './products.service.js';
import { parsePageParams } from '../common/pagination.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  async index(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const [result, status] = await this.service.findAll(parsePageParams(page, pageSize));
    res.header('X-Cache', status);
    return result;
  }

  @Get(':id')
  async show(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    const [product, status] = await this.service.findOne(id);
    res.header('X-Cache', status);
    return product;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateProductBody, @Res({ passthrough: true }) res: FastifyReply) {
    const product = await this.service.create(body);
    res.header('X-Cache', 'WRITE');
    return product;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProductBody,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const product = await this.service.update(id, body);
    res.header('X-Cache', 'WRITE');
    return product;
  }

  @Patch(':id')
  async updatePatch(
    @Param('id') id: string,
    @Body() body: UpdateProductBody,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const product = await this.service.update(id, body);
    res.header('X-Cache', 'WRITE');
    return product;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroy(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    await this.service.remove(id);
    res.header('X-Cache', 'INVALIDATED');
  }
}
