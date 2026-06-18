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
import type { CreateOrderBody, UpdateOrderBody } from './orders.service.js';
import { OrdersService } from './orders.service.js';
import { parsePageParams } from '../common/pagination.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

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
    const [order, status] = await this.service.findOne(id);
    res.header('X-Cache', status);
    return order;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateOrderBody, @Res({ passthrough: true }) res: FastifyReply) {
    const order = await this.service.create(body);
    res.header('X-Cache', 'WRITE');
    return order;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOrderBody,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const order = await this.service.update(id, body);
    res.header('X-Cache', 'WRITE');
    return order;
  }

  @Patch(':id')
  async updatePatch(
    @Param('id') id: string,
    @Body() body: UpdateOrderBody,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const order = await this.service.update(id, body);
    res.header('X-Cache', 'WRITE');
    return order;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroy(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    await this.service.remove(id);
    res.header('X-Cache', 'INVALIDATED');
  }
}
