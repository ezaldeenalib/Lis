import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { TenantPrismaService } from '../../database/tenant-prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: TenantPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest();

    // Platform JWT cannot call lab APIs — use laboratory login from /login.
    if (user?.type === 'platform') {
      throw new ForbiddenException(
        'جلسة مدير المنصة لا تصل لبيانات المختبر. سجّل الخروج ثم الدخول كمستخدم مختبر.',
      );
    }

    if (!requiredPermissions) return true;

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    if (!dbUser) {
      throw new ForbiddenException('المستخدم غير موجود أو غير مرتبط بهذا المختبر.');
    }

    const userPermissions = dbUser.role.rolePermissions.map(
      (rp) => `${rp.permission.action}:${rp.permission.subject}`,
    );

    if (userPermissions.includes('manage:all')) return true;

    const ok = requiredPermissions.every((perm) => userPermissions.includes(perm));
    if (!ok) {
      throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذه العملية.');
    }
    return true;
  }
}
