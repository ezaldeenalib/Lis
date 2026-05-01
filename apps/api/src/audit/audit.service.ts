import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { AuditAction, Prisma } from '@prisma/client';

export interface AuditLogParams {
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  userId?: string;
  laboratoryId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface GetAuditLogsQuery {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: TenantPrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: (params.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
        newValues: (params.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
        userId: params.userId ?? undefined,
        laboratoryId: params.laboratoryId ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    });
  }

  async getAuditLogs(
    query: GetAuditLogsQuery,
    laboratoryId: string,
  ): Promise<{
    data: Awaited<ReturnType<TenantPrismaService['auditLog']['findMany']>>;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      laboratoryId,
    };
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.userId) where.userId = query.userId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
