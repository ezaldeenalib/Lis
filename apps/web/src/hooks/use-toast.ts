'use client';

import { create } from 'zustand';

export type ToastVariant = 'default' | 'destructive';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  add: (toast: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: Math.random().toString(36).slice(2) },
      ],
    })),
  remove: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export interface ToastApi {
  (options: Omit<Toast, 'id'>): void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

export function useToast() {
  const add = useToastStore((s) => s.add);

  const toastFn: ToastApi = (options: Omit<Toast, 'id'>) => add(options);
  toastFn.success = (title: string, description?: string) =>
    add({ title, description, variant: 'default' });
  toastFn.error = (title: string, description?: string) =>
    add({ title, description, variant: 'destructive' });

  return { toast: toastFn };
}
