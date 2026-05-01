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
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { InvoiceStatus } from '@prisma/client';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('api/v1/invoices')
@UseGuards(PermissionsGuard)
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Get()
  @RequirePermissions('read:invoice')
  @ApiOperation({ summary: 'List invoices with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'search', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: InvoiceStatus,
    @Query('search') search?: string,
  ) {
    return this.invoicesService.list({ page, limit, status, search });
  }

  @Post()
  @RequirePermissions('create:invoice')
  @ApiOperation({ summary: 'Create a new invoice' })
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.invoicesService.create(dto, user.userId);
  }

  @Post('from-order/:orderId')
  @RequirePermissions('create:invoice')
  @ApiOperation({ summary: 'Generate invoice from an existing order' })
  async createFromOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.invoicesService.createFromOrder(orderId, user.userId);
  }

  @Get(':id')
  @RequirePermissions('read:invoice')
  @ApiOperation({ summary: 'Get invoice by ID with full details' })
  async getById(@Param('id') id: string) {
    return this.invoicesService.findById(id);
  }

  @Post(':id/payments')
  @RequirePermissions('create:invoice')
  @ApiOperation({ summary: 'Add a payment to an invoice' })
  async addPayment(
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.invoicesService.addPayment(id, dto, user.userId);
  }

  @Put(':id/cancel')
  @RequirePermissions('update:invoice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an invoice' })
  async cancel(@Param('id') id: string) {
    return this.invoicesService.cancel(id);
  }
}
