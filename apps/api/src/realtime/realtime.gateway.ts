import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../common/types';
import { LisEventName } from './realtime.events';

/** Metadata we attach to each authenticated socket. */
interface SocketMeta {
  userId:       string;
  laboratoryId: string | null;
  role:         string | null;
  type:         'laboratory' | 'platform';
}

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: (origin: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => {
      // Allow all – CORS for WS is controlled at the transport level; HTTP routes use CORS separately.
      cb(null, true);
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly socketMeta = new Map<string, SocketMeta>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`[WS] Rejected unauthenticated connection ${client.id}`);
      client.emit('error', { message: 'Unauthorized: missing token' });
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      this.logger.warn(`[WS] Invalid JWT from ${client.id}`);
      client.emit('error', { message: 'Unauthorized: invalid token' });
      client.disconnect(true);
      return;
    }

    const meta: SocketMeta = {
      userId:       payload.sub,
      laboratoryId: payload.laboratoryId ?? null,
      role:         payload.role ?? null,
      type:         payload.type,
    };
    this.socketMeta.set(client.id, meta);

    // Auto-join the laboratory room on connection
    if (meta.laboratoryId) {
      const room = `lab:${meta.laboratoryId}`;
      client.join(room);
      this.logger.log(`[WS] ${client.id} (${payload.role}) joined ${room}`);
    } else {
      this.logger.log(`[WS] Platform user ${client.id} connected`);
    }
  }

  handleDisconnect(client: Socket): void {
    const meta = this.socketMeta.get(client.id);
    this.socketMeta.delete(client.id);
    this.logger.log(`[WS] Disconnected ${client.id} (lab:${meta?.laboratoryId ?? 'platform'})`);
  }

  // ─── Room management (explicit join/leave) ────────────────────────────────

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() payload: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const meta = this.socketMeta.get(client.id);
    if (!meta) { client.disconnect(true); return; }

    const room = payload.room?.trim();
    if (!room) return;

    // Security: lab users may only join their own lab room or sub-rooms prefixed with their lab id.
    if (meta.type === 'laboratory' && meta.laboratoryId) {
      const allowed =
        room === `lab:${meta.laboratoryId}` ||
        room.startsWith(`lab:${meta.laboratoryId}:`);
      if (!allowed) {
        this.logger.warn(`[WS] ${client.id} tried to join forbidden room "${room}"`);
        return;
      }
    }

    client.join(room);
    this.logger.debug(`[WS] ${client.id} joined room "${room}"`);
    client.emit('roomJoined', { room });
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() payload: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const room = payload.room?.trim();
    if (room) {
      client.leave(room);
      this.logger.debug(`[WS] ${client.id} left room "${room}"`);
    }
  }

  /** Ping/pong keepalive */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // ─── Broadcast helpers (called by LisEventService) ───────────────────────

  emitToLab<T>(laboratoryId: string, event: LisEventName | string, data: T): void {
    this.server.to(`lab:${laboratoryId}`).emit(event, data);
  }

  emitToRoom<T>(room: string, event: string, data: T): void {
    this.server.to(room).emit(event, data);
  }

  /** Broadcast to ALL connected clients (platform-wide) */
  emitGlobal<T>(event: string, data: T): void {
    this.server.emit(event, data);
  }

  // ─── Legacy helpers (kept for backwards-compat) ───────────────────────────

  emitNewOrder(laboratoryId: string, order: unknown): void {
    this.emitToLab(laboratoryId, 'order.created', order);
  }

  emitSampleStatusChanged(laboratoryId: string, data: unknown): void {
    this.emitToLab(laboratoryId, 'sample.updated', data);
  }

  emitResultEntered(laboratoryId: string, data: unknown): void {
    this.emitToLab(laboratoryId, 'result.created', data);
  }

  emitResultValidated(laboratoryId: string, data: unknown): void {
    this.emitToLab(laboratoryId, 'result.validated', data);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private extractToken(client: Socket): string | null {
    // 1. Auth header: "Bearer <token>"
    const authHeader = client.handshake.headers['authorization'] as string | undefined;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    // 2. Query param: ?token=<token>
    const queryToken = client.handshake.query['token'];
    if (typeof queryToken === 'string' && queryToken) return queryToken;
    // 3. Socket.IO auth object: { auth: { token } }
    const auth = client.handshake.auth as Record<string, string> | undefined;
    if (auth?.token) return auth.token;
    return null;
  }
}
