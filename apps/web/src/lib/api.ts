import { clearReactQueryCache } from '@/lib/react-query-registry';
import { isDockerOnlyApiUrl } from '@/lib/docker-internal-hosts';

/** Browser: public URL or same-origin (never Docker service names). SSR: internal URL. */
function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    if (typeof window !== 'undefined' && isDockerOnlyApiUrl(configured)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[LIS] NEXT_PUBLIC_API_URL must not use a Docker hostname in the browser; using same-origin /api.',
        );
      }
      return '';
    }
    return configured.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') return '';
  return (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/$/, '');
}

const API_BASE = resolveApiBase();

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('lis_token', token);
    } else {
      localStorage.removeItem('lis_token');
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('lis_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { signal?: AbortSignal } = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      clearReactQueryCache();
      this.setToken(null);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('lis_user');
        } catch {
          /* ignore */
        }
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  get<T>(endpoint: string, signal?: AbortSignal) {
    return this.request<T>(endpoint, { signal });
  }

  post<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) });
  }

  put<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) });
  }

  patch<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(data) });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
