import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SamplesService } from './samples.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SampleStatus } from '@prisma/client';
import { RejectSampleDto } from './dto/reject-sample.dto';

@ApiTags('samples')
@ApiBearerAuth()
@Controller('api/v1/samples')
@UseGuards(PermissionsGuard)
export class SamplesController {
  constructor(private samplesService: SamplesService) {}

  @Get()
  @ApiOperation({ summary: 'List samples with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: SampleStatus })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: SampleStatus,
  ) {
    return this.samplesService.list({ page, limit, status }, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sample by ID with sampleTests and results' })
  @ApiParam({ name: 'id', description: 'Sample ID' })
  async getById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.samplesService.findById(id, user);
  }

  @Put(':id/receive')
  @RequirePermissions('update:sample')
  @ApiOperation({ summary: 'Mark sample as received' })
  @ApiParam({ name: 'id', description: 'Sample ID' })
  async receive(@Param('id') id: string) {
    return this.samplesService.receiveSample(id);
  }

  @Put(':id/reject')
  @ApiOperation({ summary: 'Reject sample with reason' })
  @ApiParam({ name: 'id', description: 'Sample ID' })
  async reject(@Param('id') id: string, @Body() dto: RejectSampleDto) {
    return this.samplesService.rejectSample(id, dto.reason);
  }
}
