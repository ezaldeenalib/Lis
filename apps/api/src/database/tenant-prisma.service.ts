import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Per-request async storage — isolates the tenant ID across concurrent requests,
 * avoiding the race condition that a singleton property would cause.
 */
export const tenantStorage = new AsyncLocalStorage<string | null>();

/**
 * Multi-tenant Prisma service that automatically injects laboratory_id
 * filters into queries based on the current per-request tenant context.
 */
@Injectable()
export class TenantPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly TENANT_SCOPED_MODELS = new Set([
    'User', 'Patient', 'Order', 'Sample',
    'LabService', 'Panel', 'Analyzer', 'AuditLog', 'ReportTemplate', 'Role',
    'Invoice', 'DeviceTestMapping',
  ]);

  async onModuleInit() {
    await this.$connect();

    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const tenantId = this.getTenantId();
      if (!tenantId) return next(params);

      const model = params.model;
      if (!model || !TenantPrismaService.TENANT_SCOPED_MODELS.has(model)) {
        return next(params);
      }

      const action = params.action;

      if (['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'].includes(action)) {
        params.args = params.args || {};
        params.args.where = params.args.where || {};
        params.args.where.laboratoryId = tenantId;
      }

      if (action === 'findUnique' || action === 'findUniqueOrThrow') {
        params.action = 'findFirst';
        params.args = params.args || {};
        params.args.where = params.args.where || {};
        params.args.where.laboratoryId = tenantId;
      }

      if (action === 'create') {
        params.args = params.args || {};
        params.args.data = params.args.data || {};
        params.args.data.laboratoryId = tenantId;
      }

      if (['update', 'updateMany', 'delete', 'deleteMany'].includes(action)) {
        params.args = params.args || {};
        params.args.where = params.args.where || {};
        params.args.where.laboratoryId = tenantId;
      }

      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Returns the tenant ID for the current async request context. */
  getTenantId(): string | null {
    return tenantStorage.getStore() ?? null;
  }

  /**
   * Kept for backward compatibility — actual context is now set by TenantMiddleware.
   * This no-op ensures the JWT strategy doesn't crash.
   */
  setTenantId(_tenantId: string | null) {
    // no-op: context is established per-request in TenantMiddleware
  }

  /** Run a callback in a context where tenant filtering is disabled (e.g. login). */
  async withoutTenant<T>(callback: () => Promise<T>): Promise<T> {
    return tenantStorage.run(null, callback);
  }
}
