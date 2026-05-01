import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('api/v1/reports')
@UseGuards(PermissionsGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  /**
   * Returns a fully-structured JSON payload for the frontend report renderer.
   * Includes: lab info, patient demographics, sample chain-of-custody,
   * per-test results with flags/units/ranges, and summary counts.
   */
  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get structured report data for an order' })
  async getOrderReport(@Param('orderId') orderId: string) {
    return this.reportsService.getOrderReport(orderId);
  }

  @Post('generate/:orderId')
  @RequirePermissions('manage:report')
  @ApiOperation({ summary: 'Generate legacy HTML report for an order' })
  async generateReport(
    @Param('orderId') orderId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const laboratoryId = user.laboratoryId!;
    const html = await this.reportsService.generateReport(orderId, laboratoryId);
    return { html };
  }

  @Get('templates')
  @ApiOperation({ summary: 'List report templates' })
  async listTemplates(@CurrentUser() user: CurrentUserPayload) {
    const laboratoryId = user.laboratoryId!;
    return this.reportsService.listTemplates(laboratoryId);
  }

  @Post('templates')
  @RequirePermissions('manage:report')
  @ApiOperation({ summary: 'Create report template' })
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const laboratoryId = user.laboratoryId!;
    return this.reportsService.createTemplate(dto, laboratoryId);
  }
}
