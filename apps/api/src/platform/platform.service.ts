import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateLaboratoryDto } from './dto/create-laboratory.dto';
import { DEFAULT_ROLES } from '../common/types';
import { seedCatalogTests } from '../lab-catalog/seed-catalog-tests';
import { CreateCatalogTestDto } from '../catalog/dto/create-catalog-test.dto';
import { UpdateCatalogTestDto } from '../catalog/dto/update-catalog-test.dto';
import { CreateAnalyzerDto } from '../analyzers/dto/create-analyzer.dto';
import { UpdateAnalyzerDto } from '../analyzers/dto/update-analyzer.dto';
import { BulkMappingDto } from '../device-mappings/dto/bulk-mapping.dto';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private prisma: TenantPrismaService,
    private authService: AuthService,
  ) {}

  async listLaboratories(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { slug: { contains: query.search, mode: 'insensitive' as const } }] }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.laboratory.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.laboratory.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createLaboratory(dto: CreateLaboratoryDto) {
    const lab = await this.prisma.laboratory.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
      },
    });

    try {
      const { seeded } = await seedCatalogTests(this.prisma);
      if (seeded > 0) {
        this.logger.log(
          `Global catalog_tests: +${seeded} new rows (laboratory "${lab.slug}" created; labs activate tests in app)`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Failed to seed catalog_tests for ${lab.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }

    const allPermissions = await this.prisma.permission.findMany();
    const permMap = new Map(allPermissions.map((p) => [`${p.action}:${p.subject}`, p.id]));

    for (const [, roleDef] of Object.entries(DEFAULT_ROLES)) {
      const role = await this.prisma.role.create({
        data: {
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
          laboratoryId: lab.id,
        },
      });

      const permIds: string[] = [];
      for (const permKey of roleDef.permissions) {
        const pid = permMap.get(permKey);
        if (pid) permIds.push(pid);
      }

      if (permIds.length) {
        await this.prisma.rolePermission.createMany({
          data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
        });
      }
    }

    if (dto.adminEmail && dto.adminPassword) {
      const adminRole = await this.prisma.role.findFirst({
        where: { name: 'LabAdmin', laboratoryId: lab.id },
      });

      if (adminRole) {
        const hashed = await this.authService.hashPassword(dto.adminPassword);
        await this.prisma.withoutTenant(() =>
          this.prisma.user.create({
            data: {
              email: dto.adminEmail!,
              password: hashed,
              firstName: dto.adminFirstName || 'Admin',
              lastName: dto.adminLastName || 'User',
              roleId: adminRole.id,
              laboratoryId: lab.id,
            },
          }),
        );
      }
    }

    return lab;
  }

  async getLaboratory(id: string) {
    const lab = await this.prisma.laboratory.findUnique({
      where: { id },
      include: { _count: { select: { users: true, patients: true, orders: true } } },
    });
    if (!lab) throw new NotFoundException('Laboratory not found');
    return lab;
  }

  async toggleLabStatus(id: string) {
    const lab = await this.prisma.laboratory.findUnique({ where: { id } });
    if (!lab) throw new NotFoundException('Laboratory not found');
    return this.prisma.laboratory.update({
      where: { id },
      data: { isActive: !lab.isActive },
    });
  }

  async getStats() {
    const [totalLabs, activeLabs, totalUsers, totalOrders, totalCatalogTests] = await Promise.all([
      this.prisma.laboratory.count(),
      this.prisma.laboratory.count({ where: { isActive: true } }),
      this.prisma.withoutTenant(() => this.prisma.user.count()),
      this.prisma.withoutTenant(() => this.prisma.order.count()),
      this.prisma.catalogTest.count(),
    ]);

    return { totalLabs, activeLabs, totalUsers, totalOrders, totalCatalogTests };
  }

  // ── Global Catalog (PLATFORM ONLY) ────────────────────────────────────────

  async listCatalog(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { nameAr: { contains: query.search, mode: 'insensitive' } },
        { department: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.catalogTest.findMany({ where, skip, take: limit, orderBy: [{ department: 'asc' }, { code: 'asc' }] }),
      this.prisma.catalogTest.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createCatalogTest(dto: CreateCatalogTestDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.catalogTest.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Test code "${code}" already exists in the catalog`);
    return this.prisma.catalogTest.create({
      data: {
        code,
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

  async updateCatalogTest(id: string, dto: UpdateCatalogTestDto) {
    const test = await this.prisma.catalogTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Catalog test not found');
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

  async deleteCatalogTest(id: string) {
    const test = await this.prisma.catalogTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Catalog test not found');
    return this.prisma.catalogTest.delete({ where: { id } });
  }

  // ── Analyzers (PLATFORM ONLY) ──────────────────────────────────────────────

  async listAnalyzers(query: { page?: number; limit?: number; laboratoryId?: string }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.laboratoryId) where.laboratoryId = query.laboratoryId;

    const [data, total] = await this.prisma.withoutTenant(() =>
      Promise.all([
        this.prisma.analyzer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { laboratory: { select: { id: true, name: true, slug: true } } },
        }),
        this.prisma.analyzer.count({ where }),
      ]),
    );
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createAnalyzer(dto: CreateAnalyzerDto & { laboratoryId: string }) {
    const lab = await this.prisma.laboratory.findUnique({ where: { id: dto.laboratoryId } });
    if (!lab) throw new NotFoundException('Laboratory not found');
    return this.prisma.withoutTenant(() =>
      this.prisma.analyzer.create({
        data: {
          name: dto.name,
          manufacturer: dto.manufacturer,
          model: dto.model,
          serialNumber: dto.serialNumber,
          laboratoryId: dto.laboratoryId,
        },
      }),
    );
  }

  async updateAnalyzer(id: string, dto: UpdateAnalyzerDto) {
    return this.prisma.withoutTenant(async () => {
      const existing = await this.prisma.analyzer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Analyzer not found');
      return this.prisma.analyzer.update({ where: { id }, data: dto });
    });
  }

  async deleteAnalyzer(id: string) {
    return this.prisma.withoutTenant(async () => {
      const existing = await this.prisma.analyzer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Analyzer not found');
      return this.prisma.analyzer.delete({ where: { id } });
    });
  }

  async linkAnalyzerTest(analyzerId: string, labServiceId: string) {
    return this.prisma.withoutTenant(async () => {
      const existing = await this.prisma.analyzerTest.findUnique({
        where: { analyzerId_labServiceId: { analyzerId, labServiceId } },
      });
      if (existing) throw new ConflictException('Lab service is already linked to this analyzer');
      return this.prisma.analyzerTest.create({
        data: { analyzerId, labServiceId },
        include: { labService: true },
      });
    });
  }

  async unlinkAnalyzerTest(analyzerId: string, labServiceId: string) {
    return this.prisma.withoutTenant(async () => {
      const record = await this.prisma.analyzerTest.findUnique({
        where: { analyzerId_labServiceId: { analyzerId, labServiceId } },
      });
      if (!record) throw new NotFoundException('Link not found');
      return this.prisma.analyzerTest.delete({ where: { id: record.id } });
    });
  }

  // ── Device Mappings (PLATFORM ONLY) ───────────────────────────────────────

  async listDeviceMappings(query: { laboratoryId: string; deviceId?: string }) {
    if (!query.laboratoryId) throw new BadRequestException('laboratoryId is required');
    return this.prisma.withoutTenant(() =>
      this.prisma.deviceTestMapping.findMany({
        where: {
          laboratoryId: query.laboratoryId,
          ...(query.deviceId ? { deviceId: { equals: query.deviceId, mode: 'insensitive' as const } } : {}),
        },
        include: { labService: { select: { id: true, code: true, name: true } } },
        orderBy: [{ deviceId: 'asc' }, { deviceCode: 'asc' }],
      }),
    );
  }

  async listDeviceIds(laboratoryId: string) {
    const rows = await this.prisma.withoutTenant(() =>
      this.prisma.deviceTestMapping.findMany({
        where: { laboratoryId },
        distinct: ['deviceId'],
        select: { deviceId: true },
        orderBy: { deviceId: 'asc' },
      }),
    );
    return rows.map((r) => r.deviceId);
  }

  async saveDeviceMappingsBulk(dto: BulkMappingDto & { laboratoryId: string }) {
    if (!dto.laboratoryId) throw new BadRequestException('laboratoryId is required');
    const trimmedDeviceId = dto.deviceId.trim();

    // Validate that labServiceIds belong to the given lab
    const serviceIds = dto.mappings.map((m) => m.labServiceId);
    const services = await this.prisma.withoutTenant(() =>
      this.prisma.labService.findMany({
        where: { id: { in: serviceIds }, laboratoryId: dto.laboratoryId },
        select: { id: true },
      }),
    );
    const validIds = new Set(services.map((s) => s.id));
    const invalid = serviceIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) throw new BadRequestException(`Invalid labServiceId(s): ${invalid.join(', ')}`);

    await this.prisma.withoutTenant(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.deviceTestMapping.deleteMany({
          where: {
            laboratoryId: dto.laboratoryId,
            deviceId: { equals: trimmedDeviceId, mode: 'insensitive' as const },
          },
        });
        await tx.deviceTestMapping.createMany({
          data: dto.mappings.map((m) => ({
            laboratoryId: dto.laboratoryId,
            deviceId: trimmedDeviceId,
            deviceCode: m.deviceCode.trim(),
            labServiceId: m.labServiceId,
          })),
          skipDuplicates: true,
        });
      }),
    );

    return this.listDeviceMappings({ laboratoryId: dto.laboratoryId, deviceId: trimmedDeviceId });
  }

  async deleteDeviceMapping(id: string) {
    return this.prisma.withoutTenant(async () => {
      const existing = await this.prisma.deviceTestMapping.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Mapping not found');
      return this.prisma.deviceTestMapping.delete({ where: { id } });
    });
  }

  // ── Migration: link existing lab_services → catalog_tests by code ──────────

  /**
   * Dry-run: report how many lab_services can be linked to catalog_tests by code match.
   */
  async migrationLinkServicesToCatalogReport() {
    return this.prisma.withoutTenant(async () => {
      const orphans = await this.prisma.labService.findMany({
        where: { catalogTestId: null },
        select: { id: true, code: true, name: true, laboratoryId: true },
      });

      const catalogTests = await this.prisma.catalogTest.findMany({
        select: { id: true, code: true, name: true },
      });
      const catalogByCode = new Map(catalogTests.map((t) => [t.code.toUpperCase(), t]));

      const matched: typeof orphans = [];
      const unmatched: typeof orphans = [];

      for (const svc of orphans) {
        const catalog = catalogByCode.get(svc.code.toUpperCase());
        if (catalog) matched.push(svc);
        else unmatched.push(svc);
      }

      return {
        orphanCount: orphans.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matched: matched.slice(0, 20),
        unmatched: unmatched.slice(0, 20),
      };
    });
  }

  /**
   * Execute: link existing lab_services to catalog_tests by matching code (case-insensitive).
   * Updates `catalogTestId` on matched records. Skips already-linked records.
   */
  async migrationLinkServicesToCatalog() {
    return this.prisma.withoutTenant(async () => {
      const orphans = await this.prisma.labService.findMany({
        where: { catalogTestId: null },
        select: { id: true, code: true },
      });

      const catalogTests = await this.prisma.catalogTest.findMany({
        select: { id: true, code: true },
      });
      const catalogByCode = new Map(catalogTests.map((t) => [t.code.toUpperCase(), t.id]));

      let linked = 0;
      let skipped = 0;

      for (const svc of orphans) {
        const catalogId = catalogByCode.get(svc.code.toUpperCase());
        if (catalogId) {
          await this.prisma.labService.update({
            where: { id: svc.id },
            data: { catalogTestId: catalogId },
          });
          linked++;
        } else {
          skipped++;
        }
      }

      return { linked, skipped, total: orphans.length };
    });
  }

  /**
   * Seed the global catalog_tests table from the default JSON, then
   * link existing orphan lab_services to their catalog counterparts.
   * Safe to run multiple times (idempotent).
   */
  async migrationSeedAndLinkCatalog() {
    const { seedCatalogTests } = await import('../lab-catalog/seed-catalog-tests');
    const { seeded } = await seedCatalogTests(this.prisma);
    const linkResult = await this.migrationLinkServicesToCatalog();
    return { catalogTestsSeeded: seeded, ...linkResult };
  }
}
