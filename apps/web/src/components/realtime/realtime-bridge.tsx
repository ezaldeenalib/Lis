'use client';

/**
 * Global real-time bridge: runs once in the dashboard layout so every page
 * receives updates. Respects notification + sound preferences.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeEvent } from '@/hooks/use-realtime';
import { useToast } from '@/hooks/use-toast';
import { useNotificationPreferencesStore } from '@/stores/notification-preferences.store';
import { playNotificationSound } from '@/lib/notification-sound';
import type {
  ResultCreatedPayload,
  OrderCreatedPayload,
  OrderCompletedPayload,
} from '@/lib/realtime';

function invalidateLabData(
  qc: ReturnType<typeof useQueryClient>,
  orderId?: string,
) {
  qc.invalidateQueries({ queryKey: ['orders'] });
  qc.invalidateQueries({ queryKey: ['results'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['samples'] });
  if (orderId) {
    qc.invalidateQueries({ queryKey: ['order', orderId] });
  } else {
    qc.invalidateQueries({ queryKey: ['order'] });
  }
}

export function RealtimeBridge() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const notify = (title: string, description: string, orderId?: string) => {
    invalidateLabData(qc, orderId);
    const { notificationsEnabled, soundEnabled } =
      useNotificationPreferencesStore.getState();
    if (!notificationsEnabled) return;
    toast({ title, description });
    if (soundEnabled) playNotificationSound();
  };

  useRealtimeEvent<ResultCreatedPayload>('result.created', (payload) => {
    notify(
      'نتيجة جديدة وصلت',
      `${payload.labServiceName} — ${payload.value}${payload.unit ? ` ${payload.unit}` : ''} (طلب #${payload.orderNumber})`,
      payload.orderId,
    );
  });

  useRealtimeEvent<ResultCreatedPayload>('result.validated', (payload) => {
    notify(
      'تم اعتماد نتيجة',
      `${payload.labServiceName} — طلب #${payload.orderNumber}`,
      payload.orderId,
    );
  });

  useRealtimeEvent<OrderCreatedPayload>('order.created', (payload) => {
    notify(
      'طلب جديد',
      `${payload.patientName} — #${payload.orderNumber}`,
      payload.orderId,
    );
  });

  useRealtimeEvent<OrderCompletedPayload>('order.completed', (payload) => {
    notify(
      'اكتمل الطلب',
      `${payload.patientName} — #${payload.orderNumber}`,
      payload.orderId,
    );
  });

  return null;
}
