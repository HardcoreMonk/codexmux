const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export const nextReconnectDelay = (attempt: number): number =>
  RECONNECT_DELAYS_MS[Math.min(Math.max(attempt, 0), RECONNECT_DELAYS_MS.length - 1)];

export const isRetriableTerminalClose = (code: number): boolean =>
  code !== 1000 && code !== 1011 && code !== 1013;
