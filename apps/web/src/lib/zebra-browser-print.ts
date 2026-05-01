/**
 * Zebra Browser Print — direct HTTP(S) to the local agent (same protocol as Zebra’s JS SDK).
 *
 * Why not only browserprint-es?
 * - It hard-codes `https://127.0.0.1:9101` for Safari+HTTPS; if you trust the cert on
 *   `https://localhost:9101/ssl_support`, Chrome may still use `http://127.0.0.1:9100`
 *   and paths diverge. We probe multiple origins and pick the first that answers `/config`.
 *
 * Override (optional): NEXT_PUBLIC_ZEBRA_AGENT_ORIGIN=https://localhost:9101
 */

const PROBE_MS = 8000;

export interface ZebraPrinter {
  uid: string;
  name: string;
  connection: string;
  deviceType: string;
  provider: string;
}

export type PrintStatus =
  | { ok: true }
  | {
      ok: false;
      code: 'AGENT_NOT_RUNNING' | 'NO_PRINTER' | 'SEND_FAILED';
      message: string;
    };

/** Remember working base (e.g. after user fixes SSL); do not cache failures */
let cachedAgentBase: string | undefined;

export function clearZebraAgentCache(): void {
  cachedAgentBase = undefined;
}

function envOrigin(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const o = process.env.NEXT_PUBLIC_ZEBRA_AGENT_ORIGIN?.trim();
  if (!o) return undefined;
  return o.endsWith('/') ? o : `${o}/`;
}

/**
 * Candidate agent URLs. Order matters: HTTPS + localhost first if page is HTTPS
 * (matches cert many users accept on ssl_support).
 */
function buildAgentCandidates(): string[] {
  const list: string[] = [];
  const custom = envOrigin();
  if (custom) list.push(custom);

  const httpsPage =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (httpsPage) {
    list.push('https://localhost:9101/');
    list.push('https://127.0.0.1:9101/');
  }
  list.push('http://127.0.0.1:9100/');
  list.push('http://localhost:9100/');
  if (!httpsPage) {
    list.push('https://localhost:9101/');
    list.push('https://127.0.0.1:9101/');
  }
  return [...new Set(list)];
}

async function fetchText(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; text: string }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), PROBE_MS);
  try {
    const r = await fetch(url, {
      ...init,
      mode: 'cors',
      signal: c.signal,
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(t);
  }
}

export async function resolveAgentBaseUrl(): Promise<string | null> {
  if (cachedAgentBase) return cachedAgentBase;
  for (const base of buildAgentCandidates()) {
    try {
      const { ok } = await fetchText(`${base}config`, { method: 'GET' });
      if (ok) {
        cachedAgentBase = base;
        return base;
      }
    } catch {
      /* try next origin */
    }
  }
  return null;
}

function flattenAvailablePayload(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const out: Record<string, unknown>[] = [];
  for (const key of Object.keys(root)) {
    const v = root[key];
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      if (item && typeof item === 'object') {
        out.push(item as Record<string, unknown>);
      }
    }
  }
  return out;
}

async function fetchAvailableRaw(base: string): Promise<Record<string, unknown>[]> {
  const { ok, text } = await fetchText(`${base}available`, { method: 'GET' });
  if (!ok) return [];
  try {
    return flattenAvailablePayload(JSON.parse(text));
  } catch {
    return [];
  }
}

async function fetchDefaultDeviceRaw(
  base: string,
): Promise<Record<string, unknown> | null> {
  const { ok, text } = await fetchText(`${base}default?type=printer`, {
    method: 'GET',
  });
  if (!ok) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Build the exact `device` object the agent expects (avoids "No value for name").
 */
function normalizeDevicePayload(
  raw: Record<string, unknown>,
): {
  name: string;
  uid: string;
  connection: string;
  deviceType: string;
  version: number;
  provider: string;
  manufacturer: string;
} {
  const uid = String(raw.uid ?? '').trim();
  let name = String(raw.name ?? '').trim();
  if (!name) name = uid || 'Zebra Printer';

  const connection = String(raw.connection ?? 'network');
  const deviceType = String(raw.deviceType ?? 'printer');
  const ver = raw.version;
  const version =
    typeof ver === 'number' && !Number.isNaN(ver)
      ? ver
      : Number(ver) || 1;
  const provider = String(raw.provider ?? 'zebra_browser_print');
  const manufacturer = String(raw.manufacturer ?? 'Zebra Technologies');

  return {
    name,
    uid: uid || name,
    connection,
    deviceType,
    version,
    provider,
    manufacturer,
  };
}

function mapRawToZebraPrinter(raw: Record<string, unknown>): ZebraPrinter {
  const n = normalizeDevicePayload(raw);
  return {
    uid: n.uid,
    name: n.name,
    connection: n.connection,
    deviceType: n.deviceType,
    provider: n.provider,
  };
}

export async function isAgentAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const base = await resolveAgentBaseUrl();
  return base !== null;
}

export async function getAvailablePrinters(): Promise<ZebraPrinter[]> {
  const base = await resolveAgentBaseUrl();
  if (!base) return [];
  const rows = await fetchAvailableRaw(base);
  return rows.map(mapRawToZebraPrinter);
}

export async function getDefaultPrinter(): Promise<ZebraPrinter | null> {
  const base = await resolveAgentBaseUrl();
  if (!base) return null;
  const raw = await fetchDefaultDeviceRaw(base);
  return raw ? mapRawToZebraPrinter(raw) : null;
}

const SSL_HINT_AR =
  'اقبل الشهادة على: https://localhost:9101/ssl_support وعلى https://127.0.0.1:9101/ssl_support إن لزم. يمكنك أيضاً تعيين NEXT_PUBLIC_ZEBRA_AGENT_ORIGIN في .env ليطابق العنوان الذي قبلت شهادته.';

export async function sendZPL(
  zpl: string,
  deviceUid?: string,
): Promise<PrintStatus> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      code: 'AGENT_NOT_RUNNING',
      message: 'الطباعة متاحة من المتصفح فقط.',
    };
  }

  const base = await resolveAgentBaseUrl();
  if (!base) {
    return {
      ok: false,
      code: 'AGENT_NOT_RUNNING',
      message: `لم يُعثر على وكيل Zebra Browser Print. شغّل التطبيق. ${SSL_HINT_AR}`,
    };
  }

  let raw: Record<string, unknown> | null = null;
  if (deviceUid) {
    const all = await fetchAvailableRaw(base);
    raw =
      all.find((d) => String(d.uid ?? '') === deviceUid) ?? null;
  } else {
    raw = await fetchDefaultDeviceRaw(base);
  }

  if (!raw) {
    return {
      ok: false,
      code: 'NO_PRINTER',
      message:
        'لم يتم العثور على طابعة. من أيقونة Zebra بجانب الساعة اختر طابعة افتراضية.',
    };
  }

  const device = normalizeDevicePayload(raw);
  const body = { device, data: zpl };

  try {
    const { ok, status, text } = await fetchText(`${base}write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (ok) return { ok: true };
    return {
      ok: false,
      code: 'SEND_FAILED',
      message: `فشل الطباعة (${status}): ${text || 'بدون تفاصيل'}. ${SSL_HINT_AR}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'SEND_FAILED',
      message: `فشل الاتصال بالوكيل: ${msg}. ${SSL_HINT_AR}`,
    };
  }
}
