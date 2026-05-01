import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantStorage } from '../database/tenant-prisma.service';

interface JwtLike {
  laboratoryId?: string;
}

/**
 * Extracts the laboratory ID from the incoming JWT (decode-only, no signature
 * verification — that is handled by JwtAuthGuard) and wraps the entire request
 * handling chain in the per-request AsyncLocalStorage context.
 *
 * This prevents the race condition that arises when a singleton property stores
 * the tenant ID and concurrent requests overwrite each other's value.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    let tenantId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const [, payloadB64] = token.split('.');
        if (payloadB64) {
          const payload = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
          ) as JwtLike;
          tenantId = payload.laboratoryId ?? null;
        }
      } catch {
        // Malformed token — JwtAuthGuard will reject the request.
      }
    }

    tenantStorage.run(tenantId, next);
  }
}
