/**
 * Socket.IO client + global event subscription registry.
 * Subscriptions survive reconnects; pages can subscribe without racing socket setup.
 */
import { io, Socket } from 'socket.io-client';
import { isDockerOnlyApiUrl } from '@/lib/docker-internal-hosts';

// ─── Shared event names (mirrors backend realtime.events.ts) ─────────────────
export const LIS_EVENTS = {
  RESULT_CREATED:   'result.created',
  RESULT_UPDATED:   'result.updated',
  RESULT_VALIDATED: 'result.validated',
  ORDER_CREATED:    'order.created',
  ORDER_COMPLETED:  'order.completed',
  ORDER_UPDATED:    'order.updated',
  SAMPLE_RECEIVED:  'sample.received',
  SAMPLE_UPDATED:   'sample.updated',
  DEVICE_CONNECTED:    'device.connected',
  DEVICE_DISCONNECTED: 'device.disconnected',
} as const;

export type LisEventName = typeof LIS_EVENTS[keyof typeof LIS_EVENTS];

// ─── Payload types ─────────────────────────────────────────────────────────────
export interface ResultCreatedPayload {
  orderId:       string;
  orderNumber:   string;
  sampleId:      string;
  sampleTestId:  string;
  labServiceCode:string;
  labServiceName:string;
  value:         string;
  unit:          string | null;
  flag:          string | null;
  status:        string;
  timestamp:     string;
  deviceId:      string | null;
}

export interface OrderCreatedPayload {
  orderId:     string;
  orderNumber: string;
  patientName: string;
  patientMrn:  string;
  priority:    string;
  timestamp:   string;
}

export interface OrderCompletedPayload {
  orderId:     string;
  orderNumber: string;
  patientName: string;
  patientMrn:  string;
  status:      string;
  timestamp:   string;
}

export interface SampleUpdatedPayload {
  sampleId:   string;
  orderId:    string;
  sampleType: string;
  status:     string;
  barcode:    string;
  timestamp:  string;
}

type EventHandler = (data: unknown) => void;

/** event → handlers (stable handler refs for socket.off) */
const _registry = new Map<string, Set<EventHandler>>();
const _sockets = new Map<string, Socket>();

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const _statusListeners = new Set<(s: RealtimeConnectionStatus) => void>();
let _status: RealtimeConnectionStatus = 'disconnected';

function setStatus(s: RealtimeConnectionStatus) {
  _status = s;
  _statusListeners.forEach((fn) => fn(s));
}

export function getRealtimeStatus(): RealtimeConnectionStatus {
  return _status;
}

export function onRealtimeStatusChange(fn: (s: RealtimeConnectionStatus) => void): () => void {
  _statusListeners.add(fn);
  fn(_status);
  return () => _statusListeners.delete(fn);
}

function resolveWsBase(): string {
  const wsOnly = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (wsOnly) {
    if (typeof window !== 'undefined' && isDockerOnlyApiUrl(wsOnly)) {
      return window.location.origin.replace(/\/$/, '');
    }
    return wsOnly.replace(/\/$/, '');
  }

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    if (typeof window !== 'undefined' && isDockerOnlyApiUrl(configured)) {
      return window.location.origin.replace(/\/$/, '');
    }
    return configured.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:4000';
    }
    return window.location.origin.replace(/\/$/, '');
  }

  return (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function attachRegistryToSocket(socket: Socket) {
  for (const [event, handlers] of _registry) {
    for (const handler of handlers) {
      socket.off(event, handler);
      socket.on(event, handler);
    }
  }
}

function wireSocketLifecycle(socket: Socket) {
  socket.on('connect', () => {
    setStatus('connected');
    attachRegistryToSocket(socket);
  });
  socket.on('disconnect', () => setStatus('disconnected'));
  socket.on('connect_error', () => setStatus('error'));
}

export function getLisSocket(token: string): Socket {
  const base = resolveWsBase();
  const key  = `${base}::${token.slice(-12)}`;

  if (!_sockets.has(key)) {
    const socket = io(`${base}/ws`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
      timeout: 10_000,
    });
    wireSocketLifecycle(socket);
    _sockets.set(key, socket);
    setStatus(socket.connected ? 'connected' : 'connecting');
  }
  return _sockets.get(key)!;
}

/**
 * Subscribe to a LIS socket event. Handlers are registered immediately if the
 * socket exists, and re-attached automatically after reconnect.
 */
export function subscribeLisEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
): () => void {
  const wrapped: EventHandler = (data) => handler(data as T);
  if (!_registry.has(event)) _registry.set(event, new Set());
  _registry.get(event)!.add(wrapped);

  for (const socket of _sockets.values()) {
    socket.on(event, wrapped);
  }

  return () => {
    _registry.get(event)?.delete(wrapped);
    for (const socket of _sockets.values()) {
      socket.off(event, wrapped);
    }
  };
}

/** Connect socket for the current session (idempotent). */
export function connectLisRealtime(token: string): Socket {
  const socket = getLisSocket(token);
  if (!socket.connected) {
    setStatus('connecting');
    socket.connect();
  }
  return socket;
}

/** Tear down the singleton (call on logout). */
export function destroyLisSocket(token: string): void {
  const base = resolveWsBase();
  const key  = `${base}::${token.slice(-12)}`;
  const sock = _sockets.get(key);
  if (sock) {
    sock.disconnect();
    _sockets.delete(key);
  }
  if (_sockets.size === 0) setStatus('disconnected');
}
