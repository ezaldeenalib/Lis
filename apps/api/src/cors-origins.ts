/**
 * Builds allowed CORS origins from WEB_URL and optional comma-separated CORS_ORIGINS.
 */
export function resolveCorsOrigins(): string | string[] {
  const fromList = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const webUrl = process.env.WEB_URL?.trim();
  const merged = [...new Set([...(webUrl ? [webUrl] : []), ...fromList])];

  if (merged.length === 0) {
    return 'http://localhost:3000';
  }
  if (merged.length === 1) {
    return merged[0];
  }
  return merged;
}
