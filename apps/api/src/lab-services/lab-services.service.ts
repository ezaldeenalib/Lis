import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreateLabServiceDto } from './dto/create-lab-service.dto';
import { UpdateLabServiceDto } from './dto/update-lab-service.dto';

@Injectable()
export class LabServicesService {
  constructor(private prisma: TenantPrismaService) {}

  async list(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.labService.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.labService.count({ where }),
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

  async create(data: CreateLabServiceDto, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) {
      throw new BadRequestException('Laboratory context is required.');
    }
    try {
      return await this.prisma.labService.create({
        data: {
          code: data.code,
          name: data.name,
          description: data.description,
          department: data.department,
          price: data.price ?? 0,
          unit: data.unit,
          normalRange: data.normalRange,
          laboratoryId: labId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A lab service with code "${data.code}" already exists.`);
      }
      throw err;
    }
  }

  async findById(id: string) {
    const labService = await this.prisma.labService.findUnique({
      where: { id },
    });
    if (!labService) {
      throw new NotFoundException('Lab service not found');
    }
    return labService;
  }

  async update(id: string, data: UpdateLabServiceDto) {
    await this.findById(id);
    return this.prisma.labService.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        department: data.department,
        price: data.price,
        unit: data.unit,
        normalRange: data.normalRange,
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.labService.delete({
      where: { id },
    });
  }
}
