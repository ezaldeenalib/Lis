import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
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
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantMiddleware } from './common/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
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
    WhatsAppModule,
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
