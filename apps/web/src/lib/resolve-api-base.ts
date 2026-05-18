import { isDockerOnlyApiUrl } from '@/lib/docker-internal-hosts';

/**
 * In the browser, when the API host matches the page host (e.g. same IP, ports 3000 vs 4000),
 * use same-origin `/api` via Next rewrites — avoids CORS preflight entirely.
 */
export function shouldUseSameOriginApiProxy(configured: string): boolean {
  if (typeof window === 'undefined') return false;
  if (isDockerOnlyApiUrl(configured)) return true;
  try {
    return new URL(configured).hostname === window.location.hostname;
  } catch {
    return false;
  }
}

/** Browser: same-origin proxy or public URL. SSR: internal Docker URL or configured. */
export function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configured) {
    if (typeof window !== 'undefined') {
      if (shouldUseSameOriginApiProxy(configured)) {
        return '';
      }
    } else if (isDockerOnlyApiUrl(configured)) {
      return (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/$/, '');
    }
    return configured.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') return '';
  return (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/$/, '');
}
