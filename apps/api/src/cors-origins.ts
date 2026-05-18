/**
 * Allowed CORS origins: localhost dev + WEB_URL + PUBLIC_HOST-derived + CORS_ORIGINS.
 * Trailing slashes stripped so browser Origin matches exactly.
 */
function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function resolveCorsOrigins(): string | string[] {
  const fromList = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);

  const webUrl = process.env.WEB_URL?.trim();
  const publicHost = process.env.PUBLIC_HOST?.trim();

  const fromPublic: string[] = [];
  if (publicHost) {
    if (publicHost.startsWith('http://') || publicHost.startsWith('https://')) {
      fromPublic.push(normalizeOrigin(publicHost));
    } else {
      fromPublic.push(normalizeOrigin(`http://${publicHost}:3000`));
    }
  }

  /** Always allow local Next dev alongside production / LAN URLs */
  const defaults = ['http://localhost:3000'];

  const merged = [
    ...new Set([
      ...defaults,
      ...(webUrl ? [normalizeOrigin(webUrl)] : []),
      ...fromPublic,
      ...fromList,
    ]),
  ];

  if (merged.length === 1) return merged[0];
  return merged;
}
