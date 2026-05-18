/**
 * Allowed CORS origins: localhost dev + WEB_URL + PUBLIC_HOST + CORS_ORIGINS.
 */
function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/** Built-in origins when env is missing or still points at localhost on a public server */
const FALLBACK_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://142.132.189.60:3000',
];

export function resolveCorsOriginsList(): string[] {
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

  return [
    ...new Set([
      ...FALLBACK_ORIGINS,
      ...(webUrl ? [normalizeOrigin(webUrl)] : []),
      ...fromPublic,
      ...fromList,
    ]),
  ];
}

/** Dynamic origin check — reflects the request Origin when allowed (required with credentials). */
export function createCorsOriginDelegate(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  const allowed = new Set(resolveCorsOriginsList());

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowed.has(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

/** @deprecated use resolveCorsOriginsList — kept for logging */
export function resolveCorsOrigins(): string[] {
  return resolveCorsOriginsList();
}
