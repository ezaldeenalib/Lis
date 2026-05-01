import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: TenantPrismaService,
    private authService: AuthService,
  ) {}

  async list(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          lastLoginAt: true,
          role: { select: { name: true } },
        },
      }),
      this.prisma.user.count(),
    ]);

    const items = data.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone ?? undefined,
      role: u.role.name,
      isActive: u.isActive,
      lastLogin: u.lastLoginAt?.toISOString(),
    }));

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(dto: CreateUserDto, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) {
      throw new BadRequestException('Laboratory context is required.');
    }
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase().trim(), laboratoryId: labId },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists in this laboratory');
    }

    const role = await this.prisma.role.findFirst({
      where: { name: dto.role, laboratoryId: labId },
    });
    if (!role) {
      throw new BadRequestException(
        `Role "${dto.role}" not found. Ensure laboratory roles are configured.`,
      );
    }

    const hashedPassword = await this.authService.hashPassword(dto.password);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        roleId: role.id,
        laboratoryId: labId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        role: { select: { name: true } },
      },
    });
  }

  async toggleActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findFirst({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: { select: { name: true } },
      },
    });
  }

  async updateRole(id: string, roleName: string, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) throw new BadRequestException('Laboratory context is required.');

    const user = await this.prisma.user.findFirst({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findFirst({
      where: { name: roleName, laboratoryId: labId },
    });
    if (!role) throw new BadRequestException(`Role "${roleName}" not found in this laboratory.`);

    return this.prisma.user.update({
      where: { id },
      data: { roleId: role.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: {
          select: {
            name: true,
            rolePermissions: { select: { permission: { select: { action: true, subject: true } } } },
          },
        },
      },
    });
  }

  async listRoles(laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) throw new BadRequestException('Laboratory context is required.');

    const roles = await this.prisma.role.findMany({
      where: { laboratoryId: labId },
      select: {
        id: true,
        name: true,
        description: true,
        rolePermissions: {
          select: { permission: { select: { action: true, subject: true, description: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.rolePermissions.map((rp) => ({
        key: `${rp.permission.action}:${rp.permission.subject}`,
        action: rp.permission.action,
        subject: rp.permission.subject,
        description: rp.permission.description,
      })),
    }));
  }
}
