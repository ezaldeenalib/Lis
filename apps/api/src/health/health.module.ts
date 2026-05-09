import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * DatabaseModule is @Global — TenantPrismaService is available without a local import.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
