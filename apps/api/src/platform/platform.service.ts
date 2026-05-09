import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateLaboratoryDto } from './dto/create-laboratory.dto';
import { DEFAULT_ROLES } from '../common/types';
import { seedLabServiceCatalogForLaboratory } from '../lab-catalog/seed-lab-service-catalog';

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
      const { inserted } = await seedLabServiceCatalogForLaboratory(this.prisma, lab.id);
      this.logger.log(
        `Laboratory "${lab.slug}": lab service catalog seeded (+${inserted} new analyses)`,
      );
    } catch (e) {
      this.logger.error(
        `Failed to seed lab service catalog for ${lab.id}: ${e instanceof Error ? e.message : String(e)}`,
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
    const [totalLabs, activeLabs, totalUsers, totalOrders] = await Promise.all([
      this.prisma.laboratory.count(),
      this.prisma.laboratory.count({ where: { isActive: true } }),
      this.prisma.withoutTenant(() => this.prisma.user.count()),
      this.prisma.withoutTenant(() => this.prisma.order.count()),
    ]);

    return { totalLabs, activeLabs, totalUsers, totalOrders };
  }
}
