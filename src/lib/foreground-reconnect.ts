export const FOREGROUND_RECONNECT_GRACE_MS = 750;
export const FOREGROUND_RECONNECT_ERROR_GRACE_MS = 5_000;
export const FOREGROUND_RECONNECT_READY_ATTEMPTS = 4;
export const FOREGROUND_RECONNECT_READY_DELAY_MS = 500;
export const FOREGROUND_RECONNECT_READY_TIMEOUT_MS = 1_000;
export const NATIVE_APP_STATE_EVENT = 'codexmux:native-app-state';

type TForegroundReconnectFetchResult = Pick<Response, 'ok'>;
type TForegroundReconnectFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<TForegroundReconnectFetchResult>;

interface IWaitForForegroundReconnectReadyOptions {
  origin?: string;
  fetcher?: TForegroundReconnectFetch;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  delay?: (ms: number) => Promise<void>;
}

export const shouldForceForegroundReconnect = (
  hiddenAt: number | null,
  now = Date.now(),
  pageWasRestored = false,
): boolean => {
  if (pageWasRestored) return true;
  if (hiddenAt === null) return false;
  return now - hiddenAt >= FOREGROUND_RECONNECT_GRACE_MS;
};

export const wasPageRestored = (event: Event): boolean =>
  'persisted' in event && Boolean((event as PageTransitionEvent).persisted);

export const nextForegroundReconnectErrorSuppressUntil = (
  now = Date.now(),
): number => now + FOREGROUND_RECONNECT_ERROR_GRACE_MS;

export const shouldSuppressForegroundReconnectError = (
  suppressUntil: number | null,
  now = Date.now(),
): boolean => suppressUntil !== null && now <= suppressUntil;

export const readNativeAppStateActive = (event: Event): boolean | null => {
  const detail = (event as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return null;
  const active = (detail as { active?: unknown }).active;
  return typeof active === 'boolean' ? active : null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const resolveForegroundOrigin = (origin?: string): string | null => {
  if (origin) return origin;
  if (typeof location === 'undefined') return null;
  return location.origin;
};

const fetchWithTimeout = async (
  fetcher: TForegroundReconnectFetch,
  url: URL,
  timeoutMs: number,
): Promise<boolean> => {
  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeout = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller?.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const waitForForegroundReconnectReady = async ({
  origin,
  fetcher = typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
  maxAttempts = FOREGROUND_RECONNECT_READY_ATTEMPTS,
  retryDelayMs = FOREGROUND_RECONNECT_READY_DELAY_MS,
  timeoutMs = FOREGROUND_RECONNECT_READY_TIMEOUT_MS,
  delay = sleep,
}: IWaitForForegroundReconnectReadyOptions = {}): Promise<boolean> => {
  const resolvedOrigin = resolveForegroundOrigin(origin);
  if (!resolvedOrigin || !fetcher) return true;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const url = new URL('/api/health', resolvedOrigin);
    url.searchParams.set('_cmuxForegroundReconnect', String(Date.now()));
    if (await fetchWithTimeout(fetcher, url, timeoutMs)) return true;
    if (attempt < maxAttempts - 1 && retryDelayMs > 0) {
      await delay(retryDelayMs);
    }
  }

  return false;
};
