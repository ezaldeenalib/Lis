import { create } from 'zustand';
import { api } from '@/lib/api';
import { clearReactQueryCache } from '@/lib/react-query-registry';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions?: string[];
  laboratoryId?: string;
  laboratoryName?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, type: 'laboratory' | 'platform') => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}

// Reads localStorage synchronously so the store is ready before the first render,
// eliminating the full-screen spinner flash that occurred when using useEffect.
function initAuthState(): { user: User | null; isAuthenticated: boolean } {
  if (typeof window === 'undefined') {
    return { user: null, isAuthenticated: false };
  }
  try {
    const token = localStorage.getItem('lis_token');
    const userJson = localStorage.getItem('lis_user');
    if (token && userJson) {
      const user = JSON.parse(userJson) as User;
      api.setToken(token);
      return { user, isAuthenticated: true };
    }
  } catch {
    // corrupted storage — treat as logged out
  }
  return { user: null, isAuthenticated: false };
}

export const useAuthStore = create<AuthState>((set) => ({
  ...initAuthState(),
  isLoading: false,

  login: async (email: string, password: string, type: 'laboratory' | 'platform') => {
    const endpoint =
      type === 'platform' ? '/platform/auth/login' : '/api/v1/auth/login';

    const response = await api.post<{ accessToken: string; user: User }>(endpoint, {
      email,
      password,
    });

    api.setToken(response.accessToken);
    localStorage.setItem('lis_user', JSON.stringify(response.user));
    clearReactQueryCache();

    set({ user: response.user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    clearReactQueryCache();
    api.setToken(null);
    localStorage.removeItem('lis_user');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const token = localStorage.getItem('lis_token');
      const userJson = localStorage.getItem('lis_user');
      if (token && userJson) {
        const user = JSON.parse(userJson) as User;
        api.setToken(token);
        set({ user, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
