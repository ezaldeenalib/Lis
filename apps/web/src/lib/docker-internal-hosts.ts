/**
 * Hostnames that resolve inside Docker but not in the user's browser.
 * If NEXT_PUBLIC_* mistakenly points here, client code falls back to same-origin.
 */
export const DOCKER_ONLY_HOSTNAMES = new Set([
  'api',
  'postgres',
  'redis',
  'web',
]);

export function isDockerOnlyApiUrl(url: string): boolean {
  try {
    return DOCKER_ONLY_HOSTNAMES.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
