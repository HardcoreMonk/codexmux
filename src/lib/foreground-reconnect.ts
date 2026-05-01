export const FOREGROUND_RECONNECT_GRACE_MS = 750;

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
