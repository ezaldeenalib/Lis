import {
  Controller, Get, Post, Put, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateLaboratoryDto } from './dto/create-laboratory.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN', 'SUPPORT')
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  @Get('laboratories')
  @ApiOperation({ summary: 'List all laboratories' })
  async listLaboratories(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.platformService.listLaboratories({ page, limit, search });
  }

  @Post('laboratories')
  @ApiOperation({ summary: 'Create a new laboratory' })
  async createLaboratory(@Body() dto: CreateLaboratoryDto) {
    return this.platformService.createLaboratory(dto);
  }

  @Get('laboratories/:id')
  @ApiOperation({ summary: 'Get laboratory details' })
  async getLaboratory(@Param('id') id: string) {
    return this.platformService.getLaboratory(id);
  }

  @Put('laboratories/:id/toggle-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate or deactivate a laboratory' })
  async toggleLabStatus(@Param('id') id: string) {
    return this.platformService.toggleLabStatus(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide statistics' })
  async getStats() {
    return this.platformService.getStats();
  }
}
