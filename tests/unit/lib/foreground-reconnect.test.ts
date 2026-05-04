import { describe, expect, it } from 'vitest';
import {
  FOREGROUND_RECONNECT_ERROR_GRACE_MS,
  FOREGROUND_RECONNECT_GRACE_MS,
  nextForegroundReconnectErrorSuppressUntil,
  readNativeAppStateActive,
  shouldForceForegroundReconnect,
  shouldSuppressForegroundReconnectError,
  waitForForegroundReconnectReady,
} from '@/lib/foreground-reconnect';

describe('foreground reconnect policy', () => {
  it('does not force reconnect without a prior hidden timestamp', () => {
    expect(shouldForceForegroundReconnect(null, 10_000)).toBe(false);
  });

  it('forces reconnect after the app was hidden long enough', () => {
    expect(
      shouldForceForegroundReconnect(10_000, 10_000 + FOREGROUND_RECONNECT_GRACE_MS),
    ).toBe(true);
  });

  it('does not force reconnect for short focus changes', () => {
    expect(
      shouldForceForegroundReconnect(10_000, 10_000 + FOREGROUND_RECONNECT_GRACE_MS - 1),
    ).toBe(false);
  });

  it('forces reconnect when the page is restored from cache', () => {
    expect(shouldForceForegroundReconnect(null, 10_000, true)).toBe(true);
  });

  it('suppresses expected socket errors briefly after Android foreground reconnect', () => {
    const now = 10_000;
    const suppressUntil = nextForegroundReconnectErrorSuppressUntil(now);

    expect(suppressUntil).toBe(now + FOREGROUND_RECONNECT_ERROR_GRACE_MS);
    expect(shouldSuppressForegroundReconnectError(null, now)).toBe(false);
    expect(shouldSuppressForegroundReconnectError(suppressUntil, suppressUntil)).toBe(true);
    expect(shouldSuppressForegroundReconnectError(suppressUntil, suppressUntil + 1)).toBe(false);
  });

  it('reads native Android app state events', () => {
    expect(readNativeAppStateActive(new Event('x'))).toBeNull();
    expect(readNativeAppStateActive({ detail: { active: false } } as unknown as Event)).toBe(false);
    expect(readNativeAppStateActive({ detail: { active: true } } as unknown as Event)).toBe(true);
  });

  it('waits until the foreground health probe succeeds before reconnecting sockets', async () => {
    const requests: string[] = [];

    const ready = await waitForForegroundReconnectReady({
      origin: 'https://codexmux.example',
      maxAttempts: 3,
      retryDelayMs: 0,
      delay: async () => {},
      fetcher: async (url) => {
        requests.push(String(url));
        return { ok: requests.length === 2 };
      },
    });

    expect(ready).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('https://codexmux.example/api/health');
  });

  it('returns false after foreground health probes fail so callers can reconnect as a fallback', async () => {
    let attempts = 0;

    const ready = await waitForForegroundReconnectReady({
      origin: 'https://codexmux.example',
      maxAttempts: 2,
      retryDelayMs: 0,
      delay: async () => {},
      fetcher: async () => {
        attempts += 1;
        throw new Error('network unavailable');
      },
    });

    expect(ready).toBe(false);
    expect(attempts).toBe(2);
  });
});
