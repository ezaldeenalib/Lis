import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Prisma, SampleStatus } from '@prisma/client';

@Injectable()
export class SamplesService {
  constructor(private prisma: TenantPrismaService) {}

  async list(
    query: { page?: number; limit?: number; status?: SampleStatus },
    viewer?: CurrentUserPayload,
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const validStatuses = Object.values(SampleStatus);
    const specialist =
      viewer?.type === 'laboratory' && viewer.role === 'Specialist' ? viewer.userId : null;
    const where: Prisma.SampleWhereInput = {};
    if (query.status && validStatuses.includes(query.status)) {
      where.status = query.status;
    }
    if (specialist) {
      where.order = { physicianUserId: specialist };
    }

    const [data, total] = await Promise.all([
      this.prisma.sample.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { include: { patient: true } },
          sampleTests: true,
        },
      }),
      this.prisma.sample.count({ where }),
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

  async findById(id: string, viewer?: CurrentUserPayload) {
    const sample = await this.prisma.sample.findUnique({
      where: { id },
      include: {
        order: { include: { patient: true } },
        sampleTests: {
          include: {
            labService: true,
            result: true,
          },
        },
      },
    });
    if (!sample) {
      throw new NotFoundException('Sample not found');
    }
    if (
      viewer?.type === 'laboratory' &&
      viewer.role === 'Specialist' &&
      sample.order.physicianUserId !== viewer.userId
    ) {
      throw new NotFoundException('Sample not found');
    }
    return sample;
  }

  async receiveSample(id: string) {
    const sample = await this.prisma.sample.findUnique({ where: { id } });
    if (!sample) {
      throw new NotFoundException('Sample not found');
    }
    return this.prisma.sample.update({
      where: { id },
      data: {
        status: SampleStatus.RECEIVED,
        receivedAt: new Date(),
      },
    });
  }

  async rejectSample(id: string, reason: string) {
    const sample = await this.prisma.sample.findUnique({ where: { id } });
    if (!sample) {
      throw new NotFoundException('Sample not found');
    }
    const existingNotes = sample.notes ? `${sample.notes}\n` : '';
    return this.prisma.sample.update({
      where: { id },
      data: {
        status: SampleStatus.REJECTED,
        notes: `${existingNotes}Rejected: ${reason}`,
      },
    });
  }
}
