import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  /** Array of permission IDs to assign (replaces current set). */
  permissionIds?: string[];
}

@Injectable()
export class RolesService {
  constructor(private prisma: TenantPrismaService) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: { id: true, action: true, subject: true, description: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => this.mapRole(r));
  }

  async getRoleById(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: { id: true, action: true, subject: true, description: true },
            },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('الدور غير موجود.');
    return this.mapRole(role);
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود.');

    // Update name / description when provided
    if (dto.name !== undefined || dto.description !== undefined) {
      const update: Record<string, string> = {};
      if (dto.name !== undefined) {
        if (!dto.name.trim()) throw new BadRequestException('اسم الدور لا يمكن أن يكون فارغاً.');
        update.name = dto.name.trim();
      }
      if (dto.description !== undefined) update.description = dto.description;

      await this.prisma.role.update({ where: { id }, data: update });
    }

    // Replace permission set when permissionIds is supplied
    if (dto.permissionIds !== undefined) {
      // Verify all supplied IDs exist
      const found = await this.prisma.permission.findMany({
        where: { id: { in: dto.permissionIds } },
        select: { id: true },
      });
      if (found.length !== dto.permissionIds.length) {
        throw new BadRequestException('بعض معرّفات الصلاحيات غير صحيحة.');
      }

      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      if (dto.permissionIds.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: dto.permissionIds.map((pid) => ({ roleId: id, permissionId: pid })),
        });
      }
    }

    return this.getRoleById(id);
  }

  /** List all globally available permissions (not tenant-scoped). */
  async listPermissions() {
    const perms = await this.prisma.permission.findMany({
      select: { id: true, action: true, subject: true, description: true },
      orderBy: [{ subject: 'asc' }, { action: 'asc' }],
    });
    return perms.map((p) => ({ ...p, key: `${p.action}:${p.subject}` }));
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private mapRole(role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    rolePermissions: {
      permission: { id: string; action: string; subject: string; description: string | null };
    }[];
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map((rp) => ({
        id: rp.permission.id,
        key: `${rp.permission.action}:${rp.permission.subject}`,
        action: rp.permission.action,
        subject: rp.permission.subject,
        description: rp.permission.description,
      })),
    };
  }
}
