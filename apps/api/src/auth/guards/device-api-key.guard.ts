import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Guard for the result ingest endpoint called by the external helper app.
 * Validates the X-Device-Api-Key header against the DEVICE_API_KEY env var.
 *
 * When DEVICE_INGEST_AUTH_DISABLED=1 (or "true"), this guard is a no-op — re-enable
 * for production by unsetting that variable and setting DEVICE_API_KEY.
 */
@Injectable()
export class DeviceApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const disabled = process.env.DEVICE_INGEST_AUTH_DISABLED;
    if (disabled === '1' || disabled?.toLowerCase() === 'true') {
      return true;
    }

    const expected = process.env.DEVICE_API_KEY;
    if (!expected) {
      throw new UnauthorizedException(
        'Device API key is not configured on the server. Set DEVICE_API_KEY in .env, or set DEVICE_INGEST_AUTH_DISABLED=1 for local dev only.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-device-api-key'];

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Device-Api-Key header');
    }

    return true;
  }
}
