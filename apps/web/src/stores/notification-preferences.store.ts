import { create } from 'zustand';

const KEY_NOTIFICATIONS = 'lis_notifications_enabled';
const KEY_SOUND = 'lis_notification_sound';

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const v = localStorage.getItem(key);
  if (v === null) return defaultValue;
  return v === '1' || v === 'true';
}

function writeBool(key: string, value: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value ? '1' : '0');
  }
}

interface NotificationPreferencesState {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  hydrated: boolean;
  hydrateFromStorage: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
}

export const useNotificationPreferencesStore = create<NotificationPreferencesState>((set, get) => ({
  notificationsEnabled: true,
  soundEnabled: true,
  hydrated: false,

  hydrateFromStorage: () =>
    set({
      notificationsEnabled: readBool(KEY_NOTIFICATIONS, true),
      soundEnabled: readBool(KEY_SOUND, true),
      hydrated: true,
    }),

  setNotificationsEnabled: (enabled) => {
    writeBool(KEY_NOTIFICATIONS, enabled);
    set({ notificationsEnabled: enabled });
  },

  setSoundEnabled: (enabled) => {
    writeBool(KEY_SOUND, enabled);
    set({ soundEnabled: enabled });
  },

  toggleNotifications: () => {
    const next = !get().notificationsEnabled;
    writeBool(KEY_NOTIFICATIONS, next);
    set({ notificationsEnabled: next });
  },

  toggleSound: () => {
    const next = !get().soundEnabled;
    writeBool(KEY_SOUND, next);
    set({ soundEnabled: next });
  },
}));
