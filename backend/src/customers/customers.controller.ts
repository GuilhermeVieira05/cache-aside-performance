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
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { CreateCustomerBody, UpdateCustomerBody } from './customers.service.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  async index(@Res({ passthrough: true }) res: FastifyReply) {
    const [customers, status] = await this.service.findAll();
    res.header('X-Cache', status);
    return customers;
  }

  @Get(':id')
  async show(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    const [customer, status] = await this.service.findOne(id);
    res.header('X-Cache', status);
    return customer;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateCustomerBody, @Res({ passthrough: true }) res: FastifyReply) {
    const customer = await this.service.create(body);
    res.header('X-Cache', 'WRITE');
    return customer;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCustomerBody,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const customer = await this.service.update(id, body);
    res.header('X-Cache', 'WRITE');
    return customer;
  }

  @Patch(':id')
  async updatePatch(
    @Param('id') id: string,
    @Body() body: UpdateCustomerBody,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const customer = await this.service.update(id, body);
    res.header('X-Cache', 'WRITE');
    return customer;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroy(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    await this.service.remove(id);
    res.header('X-Cache', 'INVALIDATED');
  }
}
