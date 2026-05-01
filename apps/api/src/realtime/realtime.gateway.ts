import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinLab')
  handleJoinLab(
    @MessageBody() payload: { laboratoryId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { laboratoryId } = payload;
    if (laboratoryId) {
      const room = `lab:${laboratoryId}`;
      client.join(room);
      this.logger.debug(`Client ${client.id} joined room ${room}`);
    }
  }

  emitToLab<T>(laboratoryId: string, event: string, data: T): void {
    const room = `lab:${laboratoryId}`;
    this.server.to(room).emit(event, data);
  }

  emitNewOrder(laboratoryId: string, order: unknown): void {
    this.emitToLab(laboratoryId, 'newOrder', order);
  }

  emitSampleStatusChanged(laboratoryId: string, data: unknown): void {
    this.emitToLab(laboratoryId, 'sampleStatusChanged', data);
  }

  emitResultEntered(laboratoryId: string, data: unknown): void {
    this.emitToLab(laboratoryId, 'resultEntered', data);
  }

  emitResultValidated(laboratoryId: string, data: unknown): void {
    this.emitToLab(laboratoryId, 'resultValidated', data);
  }
}
