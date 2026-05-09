import { Module } from '@nestjs/common';
import { BarcodeService } from './barcode.service';

/**
 * BarcodeModule — exports BarcodeService for use across the API.
 *
 * DatabaseModule is @Global(), so TenantPrismaService is already available
 * to BarcodeService without a local import.
 */
@Module({
  providers: [BarcodeService],
  exports: [BarcodeService],
})
export class BarcodeModule {}
