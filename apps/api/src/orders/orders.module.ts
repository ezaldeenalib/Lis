import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AuthModule } from '../auth/auth.module';
import { BarcodeModule } from '../barcode/barcode.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, BarcodeModule, RealtimeModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
