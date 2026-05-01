import { Module } from '@nestjs/common';
import { AnalyzersController } from './analyzers.controller';
import { AnalyzersService } from './analyzers.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AnalyzersController],
  providers: [AnalyzersService],
  exports: [AnalyzersService],
})
export class AnalyzersModule {}
