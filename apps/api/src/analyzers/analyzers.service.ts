import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreateAnalyzerDto } from './dto/create-analyzer.dto';
import { UpdateAnalyzerDto } from './dto/update-analyzer.dto';

@Injectable()
export class AnalyzersService {
  constructor(private prisma: TenantPrismaService) {}

  async list(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.analyzer.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.analyzer.count(),
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

  async create(data: CreateAnalyzerDto, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) {
      throw new BadRequestException('Laboratory context is required.');
    }
    return this.prisma.analyzer.create({
      data: {
        name: data.name,
        manufacturer: data.manufacturer,
        model: data.model,
        serialNumber: data.serialNumber,
        laboratoryId: labId,
      },
    });
  }

  async findById(id: string) {
    const analyzer = await this.prisma.analyzer.findUnique({
      where: { id },
      include: {
        analyzerTests: {
          include: {
            labService: true,
          },
        },
      },
    });
    if (!analyzer) {
      throw new NotFoundException('Analyzer not found');
    }
    return analyzer;
  }

  async update(id: string, data: UpdateAnalyzerDto) {
    await this.findById(id);
    return this.prisma.analyzer.update({
      where: { id },
      data: {
        name: data.name,
        manufacturer: data.manufacturer,
        model: data.model,
        serialNumber: data.serialNumber,
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.analyzer.delete({
      where: { id },
    });
  }

  async linkTest(analyzerId: string, labServiceId: string) {
    await this.findById(analyzerId);

    const existing = await this.prisma.analyzerTest.findUnique({
      where: {
        analyzerId_labServiceId: { analyzerId, labServiceId },
      },
    });
    if (existing) {
      throw new ConflictException('Lab service is already linked to this analyzer');
    }

    return this.prisma.analyzerTest.create({
      data: { analyzerId, labServiceId },
      include: { labService: true },
    });
  }

  async unlinkTest(analyzerId: string, labServiceId: string) {
    await this.findById(analyzerId);

    const analyzerTest = await this.prisma.analyzerTest.findUnique({
      where: {
        analyzerId_labServiceId: { analyzerId, labServiceId },
      },
    });
    if (!analyzerTest) {
      throw new NotFoundException('Lab service is not linked to this analyzer');
    }

    return this.prisma.analyzerTest.delete({
      where: { id: analyzerTest.id },
    });
  }
}
