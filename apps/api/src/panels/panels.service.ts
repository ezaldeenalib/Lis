import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';

@Injectable()
export class PanelsService {
  constructor(private prisma: TenantPrismaService) {}

  async list(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.panel.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          panelItems: {
            include: {
              labService: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.panel.count(),
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

  async create(data: CreatePanelDto, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) {
      throw new BadRequestException(
        'Laboratory context is required. Please login with a laboratory account.',
      );
    }

    const panel = await this.prisma.panel.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        price: data.price ?? 0,
        laboratoryId: labId,
      },
    });

    if (data.serviceIds?.length) {
      await this.prisma.panelItem.createMany({
        data: data.serviceIds.map((labServiceId) => ({
          panelId: panel.id,
          labServiceId,
        })),
        skipDuplicates: true,
      });
    }

    return this.findById(panel.id);
  }

  async findById(id: string) {
    const panel = await this.prisma.panel.findUnique({
      where: { id },
      include: {
        panelItems: {
          include: {
            labService: true,
          },
        },
      },
    });
    if (!panel) {
      throw new NotFoundException('Panel not found');
    }
    return panel;
  }

  async update(id: string, data: UpdatePanelDto) {
    await this.findById(id);

    const updateData: Record<string, unknown> = {};
    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;

    const panel = await this.prisma.panel.update({
      where: { id },
      data: updateData,
    });

    if (data.serviceIds !== undefined) {
      await this.prisma.panelItem.deleteMany({ where: { panelId: id } });
      if (data.serviceIds.length) {
        await this.prisma.panelItem.createMany({
          data: data.serviceIds.map((labServiceId) => ({
            panelId: id,
            labServiceId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.findById(panel.id);
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.panel.delete({
      where: { id },
    });
  }
}
