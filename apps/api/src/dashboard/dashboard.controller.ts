import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('api/v1/dashboard')
@UseGuards(PermissionsGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats(@CurrentUser() user: CurrentUserPayload) {
    const laboratoryId = user.laboratoryId!;
    return this.dashboardService.getStats(laboratoryId, user);
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Get recent orders' })
  @ApiQuery({ name: 'limit', required: false })
  async getRecentOrders(
    @Query('limit') limit?: number,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const laboratoryId = user!.laboratoryId!;
    const limitNum = limit ? Math.min(Number(limit), 50) : 10;
    return this.dashboardService.getRecentOrders(laboratoryId, limitNum, user);
  }

  @Get('pending-tests')
  @ApiOperation({ summary: 'Get count of pending tests' })
  async getPendingTests(@CurrentUser() user: CurrentUserPayload) {
    const laboratoryId = user.laboratoryId!;
    const count = await this.dashboardService.getPendingTestsCount(laboratoryId, user);
    return { count };
  }
}
