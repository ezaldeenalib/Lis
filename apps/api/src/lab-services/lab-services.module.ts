import { Module } from '@nestjs/common';
import { LabServicesController } from './lab-services.controller';
import { LabServicesService } from './lab-services.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LabServicesController],
  providers: [LabServicesService],
  exports: [LabServicesService],
})
export class LabServicesModule {}
