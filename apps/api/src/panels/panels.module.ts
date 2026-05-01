import { Module } from '@nestjs/common';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PanelsController],
  providers: [PanelsService],
  exports: [PanelsService],
})
export class PanelsModule {}
