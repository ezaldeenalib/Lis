import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  ForbiddenException,
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
import { PermissionsGuard } from '../auth/guards/permissions.guard';

const PLATFORM_ONLY_MSG =
  'إدارة ربط تحاليل الأجهزة محجوزة لمشرف المنصة. يمكنك عرض الخريطة الحالية فقط.';

@ApiTags('device-mappings')
@ApiBearerAuth()
@Controller('api/v1/device-mappings')
@UseGuards(PermissionsGuard)
export class DeviceMappingsController {
  constructor(private service: DeviceMappingsService) {}

  /** Lab users: list device IDs that have mappings for this lab (read-only). */
  @Get('devices')
  @ApiOperation({ summary: 'List device IDs with mappings for this lab (read-only)' })
  getDevices() {
    return this.service.getDevices();
  }

  /** Lab users: view mappings for a device (read-only). */
  @Get()
  @ApiOperation({ summary: 'Get device→test mappings for this lab (read-only)' })
  @ApiQuery({ name: 'deviceId', required: true, example: 'XP-300' })
  getByDevice(@Query('deviceId') deviceId: string) {
    return this.service.getByDevice(deviceId);
  }

  // ── Write operations below are PLATFORM-ONLY ─────────────────────────────
  // Platform manages mappings via POST /platform/device-mappings/bulk.

  @Post('bulk')
  @ApiOperation({ summary: '[PLATFORM ONLY] Save mappings — use /platform/device-mappings/bulk' })
  saveBulk(@Body() _dto: BulkMappingDto) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[PLATFORM ONLY] Delete mapping — use /platform/device-mappings/:id' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  deleteOne(@Param('id') _id: string) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }
}
