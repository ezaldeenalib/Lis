import { create } from 'zustand';

export type ListViewMode = 'table' | 'cards';

const STORAGE_KEY = 'lis_list_view';

function readStoredMode(): ListViewMode {
  if (typeof window === 'undefined') return 'table';
  return localStorage.getItem(STORAGE_KEY) === 'cards' ? 'cards' : 'table';
}

interface ListViewState {
  viewMode: ListViewMode;
  setViewMode: (mode: ListViewMode) => void;
  /** Call once on client after mount to avoid SSR/client hydration mismatch */
  hydrateFromStorage: () => void;
}

export const useListViewStore = create<ListViewState>((set) => ({
  viewMode: 'table',
  setViewMode: (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    set({ viewMode: mode });
  },
  hydrateFromStorage: () => set({ viewMode: readStoredMode() }),
}));
