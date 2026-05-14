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
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LabServicesService } from './lab-services.service';
import { ActivateLabServiceDto } from './dto/activate-lab-service.dto';
import { UpdateLabServiceConfigDto } from './dto/update-lab-service-config.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

const CATALOG_OWNED_MSG =
  'لا يمكن تعديل الهوية الطبية للتحليل (الكود، الاسم، القسم، الوحدة). هذه الحقول مملوكة للكتالوج العالمي.';

@ApiTags('lab-services')
@ApiBearerAuth()
@Controller('api/v1/lab-services')
@UseGuards(PermissionsGuard)
export class LabServicesController {
  constructor(private labServicesService: LabServicesService) {}

  /**
   * List all activated lab services for the current laboratory.
   * Response includes both catalog-owned identity fields and lab-configurable fields.
   */
  @Get()
  @ApiOperation({ summary: 'List activated lab services with catalog data' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.labServicesService.list({ page, limit, search });
  }

  /**
   * Browse catalog tests not yet activated for this lab (used by the activation modal).
   */
  @Get('available-catalog')
  @ApiOperation({ summary: 'List catalog tests not yet activated for this lab' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getAvailableCatalog(
    @Query('search') search?: string,
    @Query('limit') limit?: number,
  ) {
    return this.labServicesService.getUnactivatedCatalogTests({ search, limit });
  }

  /**
   * Activate a catalog test for this laboratory.
   * This creates a lab_service record linked to the global catalog test.
   * The lab only configures: price, normalRange.
   */
  @Post('activate')
  @RequirePermissions('manage:labService')
  @ApiOperation({ summary: 'Activate a global catalog test for this laboratory' })
  activate(
    @Body() dto: ActivateLabServiceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.labServicesService.activate(dto, user?.laboratoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get activated lab service by ID' })
  getById(@Param('id') id: string) {
    return this.labServicesService.findById(id);
  }

  /**
   * Update ONLY lab-configurable fields: price, normalRange, isActive.
   * Medical identity (code, name, department, unit) is catalog-owned and cannot be modified.
   */
  @Put(':id')
  @RequirePermissions('manage:labService')
  @ApiOperation({ summary: 'Update lab operational config (price, range, isActive only)' })
  updateConfig(@Param('id') id: string, @Body() dto: UpdateLabServiceConfigDto) {
    return this.labServicesService.updateConfig(id, dto);
  }

  /**
   * Deactivate (remove) a lab service from this laboratory.
   * The global catalog test remains unaffected.
   */
  @Delete(':id')
  @RequirePermissions('manage:labService')
  @ApiOperation({ summary: 'Deactivate (remove) a lab service from this laboratory' })
  delete(@Param('id') id: string) {
    return this.labServicesService.delete(id);
  }

  // ── Deprecated endpoint — blocks standalone creation attempts ──────────────

  @Post()
  @RequirePermissions('manage:labService')
  @ApiOperation({
    summary: '[DEPRECATED] Use POST /activate instead',
    description: 'Standalone lab service creation is no longer allowed. Use POST /api/v1/lab-services/activate.',
  })
  createStandalone() {
    throw new ForbiddenException(
      'إنشاء خدمة مستقلة لم يعد مدعوماً. يجب تفعيل التحليل من الكتالوج العالمي عبر POST /api/v1/lab-services/activate',
    );
  }
}
