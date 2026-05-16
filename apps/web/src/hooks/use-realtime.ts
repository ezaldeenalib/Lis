'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  connectLisRealtime,
  subscribeLisEvent,
  onRealtimeStatusChange,
  type RealtimeConnectionStatus,
} from '@/lib/realtime';
import { api } from '@/lib/api';

export type ConnectionStatus = RealtimeConnectionStatus;

/**
 * Maintains the shared Socket.IO session and exposes subscribe helpers.
 */
export function useRealtime() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    connectLisRealtime(token);
    return onRealtimeStatusChange(setStatus);
  }, []);

  const on = useCallback(<T = unknown>(event: string, handler: (data: T) => void) => {
    return subscribeLisEvent<T>(event, handler);
  }, []);

  const off = useCallback(<T = unknown>(_event: string, _handler: (data: T) => void) => {
    // Unsubscribe is returned from subscribeLisEvent; use useRealtimeEvent instead.
    void _event;
    void _handler;
  }, []);

  const joinRoom = useCallback((room: string) => {
    const token = api.getToken();
    if (!token) return;
    connectLisRealtime(token).emit('joinRoom', { room });
  }, []);

  const leaveRoom = useCallback((room: string) => {
    const token = api.getToken();
    if (!token) return;
    connectLisRealtime(token).emit('leaveRoom', { room });
  }, []);

  return { status, on, off, joinRoom, leaveRoom };
}

/**
 * Subscribe to one event with automatic cleanup.
 */
export function useRealtimeEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
  deps: React.DependencyList = [],
) {
  useEffect(() => {
    const token = api.getToken();
    if (!token) return;
    connectLisRealtime(token);
    return subscribeLisEvent<T>(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
