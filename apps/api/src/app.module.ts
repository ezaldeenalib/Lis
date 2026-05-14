import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { BarcodeModule } from './barcode/barcode.module';
import { PlatformModule } from './platform/platform.module';
import { PatientsModule } from './patients/patients.module';
import { OrdersModule } from './orders/orders.module';
import { SamplesModule } from './samples/samples.module';
import { ResultsModule } from './results/results.module';
import { LabServicesModule } from './lab-services/lab-services.module';
import { PanelsModule } from './panels/panels.module';
import { AnalyzersModule } from './analyzers/analyzers.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RealtimeModule } from './realtime/realtime.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DeviceMappingsModule } from './device-mappings/device-mappings.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './catalog/catalog.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantMiddleware } from './common/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    BarcodeModule,
    AuthModule,
    PlatformModule,
    PatientsModule,
    OrdersModule,
    SamplesModule,
    ResultsModule,
    LabServicesModule,
    PanelsModule,
    AnalyzersModule,
    UsersModule,
    RolesModule,
    AuditModule,
    ReportsModule,
    DashboardModule,
    RealtimeModule,
    InvoicesModule,
    DeviceMappingsModule,
    HealthModule,
    WhatsAppModule,
    CatalogModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
