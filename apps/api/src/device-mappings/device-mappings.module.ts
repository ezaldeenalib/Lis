import { Module } from '@nestjs/common';
import { DeviceMappingsController } from './device-mappings.controller';
import { DeviceMappingsService } from './device-mappings.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DeviceMappingsController],
  providers: [DeviceMappingsService],
  exports: [DeviceMappingsService],
})
export class DeviceMappingsModule {}
