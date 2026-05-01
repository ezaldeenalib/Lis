import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LabServicesService } from './lab-services.service';
import { CreateLabServiceDto } from './dto/create-lab-service.dto';
import { UpdateLabServiceDto } from './dto/update-lab-service.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('lab-services')
@ApiBearerAuth()
@Controller('api/v1/lab-services')
@UseGuards(PermissionsGuard)
export class LabServicesController {
  constructor(private labServicesService: LabServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List lab services with pagination and search' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.labServicesService.list({ page, limit, search });
  }

  @Post()
  @RequirePermissions('manage:labService')
  @ApiOperation({ summary: 'Create a new lab service' })
  async create(
    @Body() dto: CreateLabServiceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.labServicesService.create(dto, user?.laboratoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lab service by ID' })
  async getById(@Param('id') id: string) {
    return this.labServicesService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('manage:labService')
  @ApiOperation({ summary: 'Update a lab service' })
  async update(@Param('id') id: string, @Body() dto: UpdateLabServiceDto) {
    return this.labServicesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('manage:labService')
  @ApiOperation({ summary: 'Delete a lab service' })
  async delete(@Param('id') id: string) {
    return this.labServicesService.delete(id);
  }
}
