import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { JwtPayload } from '../common/types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: TenantPrismaService,
    private jwtService: JwtService,
  ) {}

  async loginLaboratoryUser(email: string, password: string) {
    const user = await this.prisma.withoutTenant(() =>
      this.prisma.user.findFirst({
        where: { email, isActive: true },
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
          laboratory: true,
        },
      }),
    );

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.laboratory.isActive) {
      throw new UnauthorizedException('Laboratory account is inactive');
    }

    await this.prisma.withoutTenant(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    );

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'laboratory',
      role: user.role.name,
      laboratoryId: user.laboratoryId,
    };

    const permissions = user.role.rolePermissions.map(
      (rp) => `${rp.permission.action}:${rp.permission.subject}`,
    );

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        permissions,
        laboratoryId: user.laboratoryId,
        laboratoryName: user.laboratory.name,
      },
    };
  }

  async loginPlatformUser(email: string, password: string) {
    const user = await this.prisma.platformUser.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'platform',
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async validateToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verify<JwtPayload>(token);
  }
}
