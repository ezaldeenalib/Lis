import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../../database/tenant-prisma.service';
import { JwtPayload } from '../../common/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: TenantPrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type === 'laboratory' && payload.laboratoryId) {
      this.prisma.setTenantId(payload.laboratoryId);
    } else {
      this.prisma.setTenantId(null);
    }

    return {
      userId: payload.sub,
      email: payload.email,
      type: payload.type,
      role: payload.role,
      laboratoryId: payload.laboratoryId,
    };
  }
}
