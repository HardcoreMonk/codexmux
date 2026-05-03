import { describe, expect, it } from 'vitest';
import {
  FOREGROUND_RECONNECT_ERROR_GRACE_MS,
  FOREGROUND_RECONNECT_GRACE_MS,
  nextForegroundReconnectErrorSuppressUntil,
  readNativeAppStateActive,
  shouldForceForegroundReconnect,
  shouldSuppressForegroundReconnectError,
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
});
