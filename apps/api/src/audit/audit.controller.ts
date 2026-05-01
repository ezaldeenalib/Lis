import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('api/v1/audit-logs')
@UseGuards(PermissionsGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @RequirePermissions('read:auditLog')
  @ApiOperation({ summary: 'List audit logs with filters' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const laboratoryId = user?.laboratoryId;
    if (!laboratoryId) {
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
    return this.auditService.getAuditLogs(
      { page, limit, entityType, entityId, userId },
      laboratoryId,
    );
  }
}
