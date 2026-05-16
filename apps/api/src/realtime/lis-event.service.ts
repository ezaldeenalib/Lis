import { Injectable, Logger, Optional } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import {
  LIS_EVENTS,
  LisEventName,
  ResultCreatedPayload,
  OrderCompletedPayload,
  OrderCreatedPayload,
  SampleUpdatedPayload,
} from './realtime.events';

/**
 * Centralised event-emission service.
 *
 * All business services inject LisEventService (not RealtimeGateway directly)
 * to keep Socket.IO concerns isolated here.
 *
 * – Emits ONLY after a successful DB commit.
 * – Never throws; logs errors so a socket failure never rolls back business logic.
 * – Accepts optional gateway (gateway may be absent in unit tests).
 */
@Injectable()
export class LisEventService {
  private readonly logger = new Logger(LisEventService.name);

  constructor(
    @Optional() private readonly gateway: RealtimeGateway,
  ) {}

  // ─── Low-level emit ────────────────────────────────────────────────────────

  private safeEmit(laboratoryId: string, event: LisEventName, data: unknown): void {
    if (!this.gateway) return;
    try {
      this.gateway.emitToLab(laboratoryId, event, data);
      this.logger.debug(`[RT] ${event} → lab:${laboratoryId}`);
    } catch (err) {
      this.logger.error(`[RT] Failed to emit "${event}" to lab:${laboratoryId}`, err);
    }
  }

  // ─── Domain helpers ────────────────────────────────────────────────────────

  resultCreated(laboratoryId: string, payload: ResultCreatedPayload): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.RESULT_CREATED, payload);
  }

  resultValidated(laboratoryId: string, payload: ResultCreatedPayload): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.RESULT_VALIDATED, payload);
  }

  orderCreated(laboratoryId: string, payload: OrderCreatedPayload): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.ORDER_CREATED, payload);
  }

  orderCompleted(laboratoryId: string, payload: OrderCompletedPayload): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.ORDER_COMPLETED, payload);
  }

  sampleUpdated(laboratoryId: string, payload: SampleUpdatedPayload): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.SAMPLE_UPDATED, payload);
  }

  deviceConnected(laboratoryId: string, deviceId: string): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.DEVICE_CONNECTED, {
      deviceId,
      timestamp: new Date().toISOString(),
    });
  }

  deviceDisconnected(laboratoryId: string, deviceId: string): void {
    this.safeEmit(laboratoryId, LIS_EVENTS.DEVICE_DISCONNECTED, {
      deviceId,
      timestamp: new Date().toISOString(),
    });
  }
}
