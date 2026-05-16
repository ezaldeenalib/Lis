/**
 * All Socket.IO event names emitted by the LIS backend.
 * Shared between the gateway and all services that call LisEventService.
 */
export const LIS_EVENTS = {
  // Results
  RESULT_CREATED:  'result.created',
  RESULT_UPDATED:  'result.updated',
  RESULT_VALIDATED:'result.validated',

  // Orders
  ORDER_CREATED:   'order.created',
  ORDER_COMPLETED: 'order.completed',
  ORDER_UPDATED:   'order.updated',

  // Samples
  SAMPLE_RECEIVED: 'sample.received',
  SAMPLE_UPDATED:  'sample.updated',

  // Devices
  DEVICE_CONNECTED:    'device.connected',
  DEVICE_DISCONNECTED: 'device.disconnected',
} as const;

export type LisEventName = typeof LIS_EVENTS[keyof typeof LIS_EVENTS];

// ─── Payload shapes ──────────────────────────────────────────────────────────

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
  /** ISO timestamp */
  timestamp:     string;
  /** device that sent the result (null = manual entry) */
  deviceId:      string | null;
}

export interface OrderCompletedPayload {
  orderId:      string;
  orderNumber:  string;
  patientName:  string;
  patientMrn:   string;
  status:       string;
  timestamp:    string;
}

export interface OrderCreatedPayload {
  orderId:      string;
  orderNumber:  string;
  patientName:  string;
  patientMrn:   string;
  priority:     string;
  timestamp:    string;
}

export interface SampleUpdatedPayload {
  sampleId:   string;
  orderId:    string;
  sampleType: string;
  status:     string;
  barcode:    string;
  timestamp:  string;
}
