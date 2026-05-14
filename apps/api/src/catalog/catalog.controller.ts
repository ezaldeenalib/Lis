import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

/**
 * Read-only catalog endpoint for lab users.
 * Write operations (create/update/delete) live under /platform/catalog
 * and are restricted to PLATFORM_ADMIN users.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller('api/v1/catalog')
@UseGuards(PermissionsGuard)
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Browse global medical test catalog (read-only for lab users)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.catalogService.list({
      page,
      limit,
      search,
      activeOnly: activeOnly === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get catalog test by ID' })
  findById(@Param('id') id: string) {
    return this.catalogService.findById(id);
  }
}
