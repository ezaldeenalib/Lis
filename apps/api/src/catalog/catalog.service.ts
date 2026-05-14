import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreateCatalogTestDto } from './dto/create-catalog-test.dto';
import { UpdateCatalogTestDto } from './dto/update-catalog-test.dto';

@Injectable()
export class CatalogService {
  constructor(private prisma: TenantPrismaService) {}

  async list(query: { page?: number; limit?: number; search?: string; activeOnly?: boolean }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.activeOnly) where.isActive = true;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { nameAr: { contains: query.search, mode: 'insensitive' } },
        { department: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.catalogTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ department: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.catalogTest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const test = await this.prisma.catalogTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Catalog test not found');
    return test;
  }

  async create(dto: CreateCatalogTestDto) {
    const existing = await this.prisma.catalogTest.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });
    if (existing) throw new ConflictException(`Test code "${dto.code}" already exists in the catalog`);

    return this.prisma.catalogTest.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() ?? null,
        category: dto.category?.trim() ?? null,
        department: dto.department?.trim() ?? null,
        sampleType: dto.sampleType?.trim() ?? null,
        unit: dto.unit?.trim() ?? null,
        description: dto.description?.trim() ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCatalogTestDto) {
    await this.findById(id);
    return this.prisma.catalogTest.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr?.trim() ?? null } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() ?? null } : {}),
        ...(dto.department !== undefined ? { department: dto.department?.trim() ?? null } : {}),
        ...(dto.sampleType !== undefined ? { sampleType: dto.sampleType?.trim() ?? null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit?.trim() ?? null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.catalogTest.delete({ where: { id } });
  }
}
