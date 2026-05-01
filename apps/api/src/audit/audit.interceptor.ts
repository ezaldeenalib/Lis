import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from './audit.service';
import { AuditAction } from '@prisma/client';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_TO_ACTION: Record<string, AuditAction> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    if (!MUTATION_METHODS.includes(method)) {
      return next.handle();
    }

    const user = request.user as { userId?: string; laboratoryId?: string } | undefined;
    const userId = user?.userId;
    const laboratoryId = user?.laboratoryId;
    const ipAddress = request.ip ?? request.socket?.remoteAddress;
    const userAgent = request.get('user-agent');

    const { entityType, entityId } = this.extractEntityFromUrl(request.url);

    if (!entityType || !entityId) {
      return next.handle();
    }

    const action = METHOD_TO_ACTION[method];

    return next.handle().pipe(
      tap((response) => {
        const newValues =
          response && typeof response === 'object' && 'id' in response
            ? (response as Record<string, unknown>)
            : undefined;

        this.auditService
          .log({
            action,
            entityType,
            entityId,
            newValues,
            userId,
            laboratoryId,
            ipAddress,
            userAgent,
          })
          .catch(() => {
            // Silently ignore audit logging errors to not affect the main request
          });
      }),
    );
  }

  private extractEntityFromUrl(url: string): { entityType: string; entityId: string } {
    const match = url.match(/\/api\/v1\/([^/]+)(?:\/([^/?]+))?/);
    if (!match) return { entityType: '', entityId: '' };

    const [, resource, id] = match;
    const entityType = resource ? this.toPascalCase(resource.replace(/-/g, '_')) : '';
    const entityId = id ?? '';

    return { entityType, entityId };
  }

  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }
}
