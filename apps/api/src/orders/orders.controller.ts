import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrderStatus } from '@prisma/client';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('api/v1/orders')
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders with pagination and status filter' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'search', required: false })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('search') search?: string,
  ) {
    return this.ordersService.list({ page, limit, status, search }, user);
  }

  @Post()
  @RequirePermissions('create:order')
  @ApiOperation({ summary: 'Create a new order' })
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.create(dto, user.userId, user.laboratoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with relations' })
  async getById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.findById(id, user);
  }

  @Put(':id/cancel')
  @RequirePermissions('update:order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order' })
  async cancel(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }
}
