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
import { AnalyzersService } from './analyzers.service';
import { CreateAnalyzerDto } from './dto/create-analyzer.dto';
import { UpdateAnalyzerDto } from './dto/update-analyzer.dto';
import { LinkTestDto } from './dto/link-test.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('analyzers')
@ApiBearerAuth()
@Controller('api/v1/analyzers')
@UseGuards(PermissionsGuard)
export class AnalyzersController {
  constructor(private analyzersService: AnalyzersService) {}

  @Get()
  @ApiOperation({ summary: 'List analyzers with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.analyzersService.list({ page, limit });
  }

  @Post()
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Create a new analyzer' })
  async create(
    @Body() dto: CreateAnalyzerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.analyzersService.create(dto, user?.laboratoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get analyzer by ID with linked tests' })
  async getById(@Param('id') id: string) {
    return this.analyzersService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Update an analyzer' })
  async update(@Param('id') id: string, @Body() dto: UpdateAnalyzerDto) {
    return this.analyzersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Delete an analyzer' })
  async delete(@Param('id') id: string) {
    return this.analyzersService.delete(id);
  }

  @Post(':id/link-test')
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Link a lab service to the analyzer' })
  async linkTest(
    @Param('id') id: string,
    @Body() dto: LinkTestDto,
  ) {
    return this.analyzersService.linkTest(id, dto.labServiceId);
  }

  @Delete(':id/unlink-test/:labServiceId')
  @RequirePermissions('manage:analyzer')
  @ApiOperation({ summary: 'Unlink a lab service from the analyzer' })
  async unlinkTest(
    @Param('id') id: string,
    @Param('labServiceId') labServiceId: string,
  ) {
    return this.analyzersService.unlinkTest(id, labServiceId);
  }
}
