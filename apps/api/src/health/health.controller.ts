import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TenantPrismaService } from '../database/tenant-prisma.service';

@ApiTags('health')
@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly prisma: TenantPrismaService) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness — process is running (no DB check)' })
  live() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — database connectivity check' })
  async ready() {
    await this.prisma.withoutTenant(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
    return { status: 'ok', ts: new Date().toISOString(), database: 'up' };
  }
}
