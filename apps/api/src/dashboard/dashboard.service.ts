import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { OrderStatus, Prisma, SampleTestStatus } from '@prisma/client';

export interface DashboardStats {
  totalPatients: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalSamples: number;
  pendingSampleTests: number;
  todayOrders: number;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: TenantPrismaService) {}

  async getStats(laboratoryId: string, viewer?: CurrentUserPayload): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const specialist =
      viewer?.type === 'laboratory' && viewer.role === 'Specialist' ? viewer.userId : null;
    const orderWhere: Prisma.OrderWhereInput = specialist
      ? { laboratoryId, physicianUserId: specialist }
      : { laboratoryId };
    const patientWhere: Prisma.PatientWhereInput = specialist
      ? { laboratoryId, orders: { some: { physicianUserId: specialist } } }
      : { laboratoryId };
    const sampleWhere: Prisma.SampleWhereInput = specialist
      ? { laboratoryId, order: { physicianUserId: specialist } }
      : { laboratoryId };
    const pendingTestWhere: Prisma.SampleTestWhereInput = {
      status: SampleTestStatus.PENDING,
      sample: specialist
        ? { laboratoryId, order: { physicianUserId: specialist } }
        : { laboratoryId },
    };

    const [
      totalPatients,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalSamples,
      pendingSampleTests,
      todayOrders,
    ] = await Promise.all([
      this.prisma.patient.count({ where: patientWhere }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.count({
        where: {
          ...orderWhere,
          status: { in: [OrderStatus.PENDING, OrderStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.order.count({
        where: { ...orderWhere, status: OrderStatus.COMPLETED },
      }),
      this.prisma.sample.count({ where: sampleWhere }),
      this.prisma.sampleTest.count({
        where: pendingTestWhere,
      }),
      this.prisma.order.count({
        where: {
          ...orderWhere,
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
    ]);

    return {
      totalPatients,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalSamples,
      pendingSampleTests,
      todayOrders,
    };
  }

  async getRecentOrders(laboratoryId: string, limit = 10, viewer?: CurrentUserPayload) {
    const specialist =
      viewer?.type === 'laboratory' && viewer.role === 'Specialist' ? viewer.userId : null;
    const where: Prisma.OrderWhereInput = specialist
      ? { laboratoryId, physicianUserId: specialist }
      : { laboratoryId };
    return this.prisma.order.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true, phone: true },
        },
      },
    });
  }

  async getPendingTestsCount(laboratoryId: string, viewer?: CurrentUserPayload): Promise<number> {
    const specialist =
      viewer?.type === 'laboratory' && viewer.role === 'Specialist' ? viewer.userId : null;
    return this.prisma.sampleTest.count({
      where: {
        status: SampleTestStatus.PENDING,
        sample: specialist
          ? { laboratoryId, order: { physicianUserId: specialist } }
          : { laboratoryId },
      },
    });
  }
}
