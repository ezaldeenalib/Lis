import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { ActivateLabServiceDto } from './dto/activate-lab-service.dto';
import { UpdateLabServiceConfigDto } from './dto/update-lab-service-config.dto';

@Injectable()
export class LabServicesService {
  constructor(private prisma: TenantPrismaService) {}

  /**
   * List lab services with their linked catalog test data.
   * Returns both the lab-configurable fields (price, normalRange, isActive)
   * and the catalog-owned identity fields (code, name, department, unit).
   */
  async list(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
            { department: { contains: query.search, mode: 'insensitive' as const } },
            {
              catalogTest: {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' as const } },
                  { code: { contains: query.search, mode: 'insensitive' as const } },
                  { department: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.labService.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ department: 'asc' }, { name: 'asc' }],
        include: {
          catalogTest: {
            select: {
              id: true,
              code: true,
              name: true,
              nameAr: true,
              department: true,
              category: true,
              sampleType: true,
              unit: true,
            },
          },
        },
      }),
      this.prisma.labService.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const service = await this.prisma.labService.findUnique({
      where: { id },
      include: {
        catalogTest: true,
      },
    });
    if (!service) throw new NotFoundException('Lab service not found');
    return service;
  }

  /**
   * Activate a global catalog test for this laboratory.
   * Creates a lab_service record linked to the catalog test.
   * Medical identity is copied from the catalog (code, name, department, unit).
   * Labs ONLY set: price, normalRange.
   */
  async activate(dto: ActivateLabServiceDto, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) throw new BadRequestException('Laboratory context is required.');

    const catalogTest = await this.prisma.catalogTest.findUnique({
      where: { id: dto.catalogTestId },
    });
    if (!catalogTest) throw new NotFoundException('Catalog test not found');
    if (!catalogTest.isActive) throw new BadRequestException('This catalog test is not active');

    // Check for duplicate activation in the same lab
    const existing = await this.prisma.labService.findFirst({
      where: {
        catalogTestId: dto.catalogTestId,
        laboratoryId: labId,
      } as Record<string, unknown>,
    });
    if (existing) {
      throw new ConflictException(
        `Test "${catalogTest.code} — ${catalogTest.name}" is already activated for this laboratory`,
      );
    }

    return this.prisma.labService.create({
      data: {
        // Identity copied from global catalog (not editable by lab)
        code: catalogTest.code,
        name: catalogTest.name,
        department: catalogTest.department ?? undefined,
        unit: catalogTest.unit ?? undefined,
        description: catalogTest.description ?? undefined,
        // Link to catalog
        catalogTestId: dto.catalogTestId,
        // Lab-configurable fields
        price: dto.price ?? 0,
        normalRange: dto.normalRange ?? undefined,
        isActive: true,
        laboratoryId: labId,
      },
      include: { catalogTest: true },
    });
  }

  /**
   * Update ONLY the lab-configurable operational fields.
   * Medical identity fields (code, name, department, unit) are catalog-owned
   * and are blocked here by enforcement.
   */
  async updateConfig(id: string, dto: UpdateLabServiceConfigDto) {
    await this.findById(id);
    return this.prisma.labService.update({
      where: { id },
      data: {
        price: dto.price,
        normalRange: dto.normalRange,
        isActive: dto.isActive,
      },
      include: { catalogTest: true },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.labService.delete({ where: { id } });
  }

  /**
   * Returns all active catalog tests NOT yet activated for the current lab.
   * Used by the "Activate from Catalog" browser in the lab UI.
   */
  async getUnactivatedCatalogTests(query: { search?: string; limit?: number }) {
    const limit = Math.min(Number(query.limit) || 100, 300);
    const labId = this.prisma.getTenantId();
    if (!labId) throw new BadRequestException('Laboratory context is required.');

    // Get IDs of already activated catalog tests for this lab
    const activated = await this.prisma.labService.findMany({
      where: { catalogTestId: { not: null } } as Record<string, unknown>,
      select: { catalogTestId: true },
    });
    const activatedIds = activated
      .map((s) => s.catalogTestId)
      .filter((id): id is string => id !== null);

    const where: Record<string, unknown> = {
      isActive: true,
      id: { notIn: activatedIds },
    };
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { nameAr: { contains: query.search, mode: 'insensitive' } },
        { department: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.catalogTest.findMany({
      where,
      take: limit,
      orderBy: [{ department: 'asc' }, { code: 'asc' }],
    });
  }
}
