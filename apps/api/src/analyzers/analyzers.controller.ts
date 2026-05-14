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
import { AnalyzersService } from './analyzers.service';
import { CreateAnalyzerDto } from './dto/create-analyzer.dto';
import { UpdateAnalyzerDto } from './dto/update-analyzer.dto';
import { LinkTestDto } from './dto/link-test.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

const PLATFORM_ONLY_MSG =
  'إدارة الأجهزة محجوزة لمشرف المنصة. يمكنك عرض الأجهزة المرتبطة بمختبرك فقط.';

@ApiTags('analyzers')
@ApiBearerAuth()
@Controller('api/v1/analyzers')
@UseGuards(PermissionsGuard)
export class AnalyzersController {
  constructor(private analyzersService: AnalyzersService) {}

  /** Lab users: list their lab's analyzers (read-only). */
  @Get()
  @ApiOperation({ summary: 'List analyzers for the current lab (read-only)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.analyzersService.list({ page, limit });
  }

  /** Lab users: view analyzer detail (read-only). */
  @Get(':id')
  @ApiOperation({ summary: 'Get analyzer by ID (read-only)' })
  getById(@Param('id') id: string) {
    return this.analyzersService.findById(id);
  }

  // ── Write operations below are PLATFORM-ONLY ─────────────────────────────
  // Lab endpoints are kept for backward-compat but always throw 403.
  // Platform manages analyzers via POST /platform/analyzers.

  @Post()
  @ApiOperation({ summary: '[PLATFORM ONLY] Create analyzer — use /platform/analyzers' })
  create(@CurrentUser() _user: CurrentUserPayload) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }

  @Put(':id')
  @ApiOperation({ summary: '[PLATFORM ONLY] Update analyzer — use /platform/analyzers/:id' })
  update(@Param('id') _id: string, @Body() _dto: UpdateAnalyzerDto) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[PLATFORM ONLY] Delete analyzer — use /platform/analyzers/:id' })
  delete(@Param('id') _id: string) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }

  @Post(':id/link-test')
  @ApiOperation({ summary: '[PLATFORM ONLY] Link test to analyzer — use /platform/analyzers/:id/link-test' })
  linkTest(@Param('id') _id: string, @Body() _dto: LinkTestDto) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }

  @Delete(':id/unlink-test/:labServiceId')
  @ApiOperation({ summary: '[PLATFORM ONLY] Unlink test from analyzer' })
  unlinkTest(@Param('id') _id: string, @Param('labServiceId') _labServiceId: string) {
    throw new ForbiddenException(PLATFORM_ONLY_MSG);
  }
}
