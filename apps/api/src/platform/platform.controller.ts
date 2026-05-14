import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateLaboratoryDto } from './dto/create-laboratory.dto';
import { CreateCatalogTestDto } from '../catalog/dto/create-catalog-test.dto';
import { UpdateCatalogTestDto } from '../catalog/dto/update-catalog-test.dto';
import { CreateAnalyzerDto } from '../analyzers/dto/create-analyzer.dto';
import { UpdateAnalyzerDto } from '../analyzers/dto/update-analyzer.dto';
import { BulkMappingDto } from '../device-mappings/dto/bulk-mapping.dto';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsUUID, IsOptional, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class CreatePlatformAnalyzerDto extends CreateAnalyzerDto {
  @ApiProperty({ description: 'Laboratory ID to assign this analyzer to' })
  @IsString()
  @IsNotEmpty()
  laboratoryId!: string;
}

class BulkMappingWithLabDto extends BulkMappingDto {
  @ApiProperty({ description: 'Laboratory ID these mappings belong to' })
  @IsString()
  @IsNotEmpty()
  laboratoryId!: string;
}

class CatalogMappingItemDto {
  @ApiProperty({ example: 'WBC', description: 'Analyte code sent by the device' })
  @IsString()
  @IsNotEmpty()
  deviceCode!: string;

  @ApiProperty({ description: 'Global catalog test UUID' })
  @IsUUID()
  catalogTestId!: string;
}

class BulkCatalogMappingDto {
  @ApiProperty({ example: 'XP-300', description: 'Device identifier used by the helper app' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({ type: [CatalogMappingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CatalogMappingItemDto)
  mappings!: CatalogMappingItemDto[];
}

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN', 'SUPPORT')
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  // ── Laboratories ───────────────────────────────────────────────────────────

  @Get('laboratories')
  @ApiOperation({ summary: 'List all laboratories' })
  listLaboratories(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.platformService.listLaboratories({ page, limit, search });
  }

  @Post('laboratories')
  @ApiOperation({ summary: 'Create a new laboratory' })
  createLaboratory(@Body() dto: CreateLaboratoryDto) {
    return this.platformService.createLaboratory(dto);
  }

  @Get('laboratories/:id')
  @ApiOperation({ summary: 'Get laboratory details' })
  getLaboratory(@Param('id') id: string) {
    return this.platformService.getLaboratory(id);
  }

  @Get('lab-services')
  @ApiOperation({ summary: '[PLATFORM] List activated lab services for a laboratory' })
  @ApiQuery({ name: 'laboratoryId', required: true, description: 'Target laboratory' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  listLabServicesForLaboratory(
    @Query('laboratoryId') laboratoryId: string,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.platformService.listLabServicesForLaboratory({ laboratoryId, limit, search });
  }

  @Put('laboratories/:id/toggle-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate or deactivate a laboratory' })
  toggleLabStatus(@Param('id') id: string) {
    return this.platformService.toggleLabStatus(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide statistics' })
  getStats() {
    return this.platformService.getStats();
  }

  // ── Global Medical Catalog ─────────────────────────────────────────────────

  @Get('catalog')
  @ApiOperation({ summary: '[PLATFORM] List global medical test catalog' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  listCatalog(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.platformService.listCatalog({ page, limit, search });
  }

  @Post('catalog')
  @ApiOperation({ summary: '[PLATFORM] Create a global catalog test' })
  createCatalogTest(@Body() dto: CreateCatalogTestDto) {
    return this.platformService.createCatalogTest(dto);
  }

  @Put('catalog/:id')
  @ApiOperation({ summary: '[PLATFORM] Update a catalog test' })
  updateCatalogTest(@Param('id') id: string, @Body() dto: UpdateCatalogTestDto) {
    return this.platformService.updateCatalogTest(id, dto);
  }

  @Delete('catalog/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Delete a catalog test' })
  deleteCatalogTest(@Param('id') id: string) {
    return this.platformService.deleteCatalogTest(id);
  }

  // ── Analyzers (Device Management) ─────────────────────────────────────────

  @Get('analyzers')
  @ApiOperation({ summary: '[PLATFORM] List all analyzers across labs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'laboratoryId', required: false })
  listAnalyzers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('laboratoryId') laboratoryId?: string,
  ) {
    return this.platformService.listAnalyzers({ page, limit, laboratoryId });
  }

  @Post('analyzers')
  @ApiOperation({ summary: '[PLATFORM] Create and assign an analyzer to a lab' })
  createAnalyzer(@Body() dto: CreatePlatformAnalyzerDto) {
    return this.platformService.createAnalyzer(dto);
  }

  @Put('analyzers/:id')
  @ApiOperation({ summary: '[PLATFORM] Update an analyzer' })
  updateAnalyzer(@Param('id') id: string, @Body() dto: UpdateAnalyzerDto) {
    return this.platformService.updateAnalyzer(id, dto);
  }

  @Delete('analyzers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Delete an analyzer' })
  deleteAnalyzer(@Param('id') id: string) {
    return this.platformService.deleteAnalyzer(id);
  }

  @Post('analyzers/:id/link-test')
  @ApiOperation({ summary: '[PLATFORM] Link a lab service to an analyzer' })
  linkAnalyzerTest(
    @Param('id') analyzerId: string,
    @Body('labServiceId') labServiceId: string,
  ) {
    return this.platformService.linkAnalyzerTest(analyzerId, labServiceId);
  }

  @Delete('analyzers/:id/unlink-test/:labServiceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Unlink a lab service from an analyzer' })
  unlinkAnalyzerTest(
    @Param('id') analyzerId: string,
    @Param('labServiceId') labServiceId: string,
  ) {
    return this.platformService.unlinkAnalyzerTest(analyzerId, labServiceId);
  }

  // ── Device Test Mappings ───────────────────────────────────────────────────

  @Get('device-mappings')
  @ApiOperation({ summary: '[PLATFORM] List device mappings for a lab' })
  @ApiQuery({ name: 'laboratoryId', required: true })
  @ApiQuery({ name: 'deviceId', required: false })
  listDeviceMappings(
    @Query('laboratoryId') laboratoryId: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.platformService.listDeviceMappings({ laboratoryId, deviceId });
  }

  @Get('device-mappings/devices')
  @ApiOperation({ summary: '[PLATFORM] List device IDs registered for a lab' })
  @ApiQuery({ name: 'laboratoryId', required: true })
  listDeviceIds(@Query('laboratoryId') laboratoryId: string) {
    return this.platformService.listDeviceIds(laboratoryId);
  }

  @Post('device-mappings/bulk')
  @ApiOperation({ summary: '[PLATFORM] Save (upsert) device mappings for a lab' })
  saveDeviceMappings(@Body() dto: BulkMappingWithLabDto) {
    return this.platformService.saveDeviceMappingsBulk(dto);
  }

  @Delete('device-mappings/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Delete a single device mapping' })
  deleteDeviceMapping(@Param('id') id: string) {
    return this.platformService.deleteDeviceMapping(id);
  }

  // ── Data Migration Utilities ───────────────────────────────────────────────

  @Get('migration/link-services-to-catalog')
  @ApiOperation({ summary: '[PLATFORM] Dry-run: report orphan lab_services that can be linked to catalog_tests' })
  migrationLinkReportDryRun() {
    return this.platformService.migrationLinkServicesToCatalogReport();
  }

  @Post('migration/link-services-to-catalog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Execute: link orphan lab_services → catalog_tests by code match' })
  migrationLinkExecute() {
    return this.platformService.migrationLinkServicesToCatalog();
  }

  @Post('migration/seed-and-link-catalog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Seed catalog_tests from JSON then link orphan lab_services' })
  migrationSeedAndLink() {
    return this.platformService.migrationSeedAndLinkCatalog();
  }

  // ── Catalog Device Mappings ────────────────────────────────────────────────

  @Get('catalog-device-mappings/devices')
  @ApiOperation({ summary: '[PLATFORM] List device IDs with catalog-level mappings' })
  listCatalogDeviceIds() {
    return this.platformService.listCatalogDeviceIds();
  }

  @Get('catalog-device-mappings')
  @ApiOperation({ summary: '[PLATFORM] List catalog-level device mappings' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'catalogTestId', required: false })
  listCatalogDeviceMappings(
    @Query('deviceId') deviceId?: string,
    @Query('catalogTestId') catalogTestId?: string,
  ) {
    return this.platformService.listCatalogDeviceMappings({ deviceId, catalogTestId });
  }

  @Post('catalog-device-mappings/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Save catalog-level device mappings (full-replace per device)' })
  saveCatalogDeviceMappingsBulk(@Body() dto: BulkCatalogMappingDto) {
    return this.platformService.saveCatalogDeviceMappingsBulk(dto);
  }

  @Delete('catalog-device-mappings/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Delete a single catalog device mapping' })
  deleteCatalogDeviceMapping(@Param('id') id: string) {
    return this.platformService.deleteCatalogDeviceMapping(id);
  }

  // ── Promotion Migration ────────────────────────────────────────────────────

  @Get('migration/promote-mappings')
  @ApiOperation({ summary: '[PLATFORM] Dry-run: identify lab mappings eligible for catalog promotion' })
  migrationPromoteMappingsReport() {
    return this.platformService.migrationPromoteMappingsReport();
  }

  @Post('migration/promote-mappings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[PLATFORM] Execute: promote consistent lab mappings to catalog level' })
  migrationPromoteMappingsExecute() {
    return this.platformService.migrationPromoteMappingsExecute();
  }
}
