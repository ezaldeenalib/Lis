import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { DeviceMappingsService } from './device-mappings.service';
import { BulkMappingDto } from './dto/bulk-mapping.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('device-mappings')
@ApiBearerAuth()
@Controller('api/v1/device-mappings')
@UseGuards(PermissionsGuard)
export class DeviceMappingsController {
  constructor(private service: DeviceMappingsService) {}

  @Get('devices')
  @ApiOperation({ summary: 'List all device IDs registered in this lab' })
  getDevices() {
    return this.service.getDevices();
  }

  @Get()
  @ApiOperation({ summary: 'Get mappings for a specific device' })
  @ApiQuery({ name: 'deviceId', required: true, example: 'XP-300' })
  getByDevice(@Query('deviceId') deviceId: string) {
    return this.service.getByDevice(deviceId);
  }

  @Post('bulk')
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Save (upsert) all mappings for a device' })
  saveBulk(@Body() dto: BulkMappingDto) {
    return this.service.saveBulk(dto);
  }

  @Delete(':id')
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Delete a single mapping entry' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  deleteOne(@Param('id') id: string) {
    return this.service.deleteOne(id);
  }
}
