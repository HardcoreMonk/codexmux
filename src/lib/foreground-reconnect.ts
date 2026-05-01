export const FOREGROUND_RECONNECT_GRACE_MS = 750;
export const NATIVE_APP_STATE_EVENT = 'codexmux:native-app-state';

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

export const readNativeAppStateActive = (event: Event): boolean | null => {
  const detail = (event as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return null;
  const active = (detail as { active?: unknown }).active;
  return typeof active === 'boolean' ? active : null;
};
