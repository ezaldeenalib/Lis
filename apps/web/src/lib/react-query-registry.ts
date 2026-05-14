import type { QueryClient } from '@tanstack/react-query';

let client: QueryClient | null = null;

export function registerQueryClient(c: QueryClient) {
  client = c;
}

/** Drop cached API data — required when tenant / JWT changes so another lab cannot see stale queries. */
export function clearReactQueryCache() {
  client?.clear();
}
