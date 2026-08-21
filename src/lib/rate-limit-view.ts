import type { IRateLimitWindow } from '@/types/status';

export type TRateLimitPeriod = '5h' | '7d';

export interface IRateLimitWindowView {
  stale: boolean;
  usedPercentage: number;
  projectedPercentage: number | null;
  resetsAt: number;
  observedAt: number | null;
  remainingSeconds: number;
}

const PERIOD_SECONDS: Record<TRateLimitPeriod, number> = {
  '5h': 5 * 3600,
  '7d': 7 * 86400,
};

export const getRateLimitWindowView = (
  window: IRateLimitWindow,
  period: TRateLimitPeriod,
  nowMs = Date.now(),
): IRateLimitWindowView => {
  const nowSeconds = nowMs / 1000;
  const stale = window.resets_at <= nowSeconds;
  const usedPercentage = Math.min(100, Math.max(0, Math.round(window.used_percentage)));
  const remainingSeconds = Math.max(0, Math.floor(window.resets_at - nowSeconds));
  if (stale) {
    return {
      stale: true,
      usedPercentage,
      projectedPercentage: null,
      resetsAt: window.resets_at,
      observedAt: window.observed_at ?? null,
      remainingSeconds,
    };
  }

  const periodSeconds = PERIOD_SECONDS[period];
  const elapsedSeconds = periodSeconds - remainingSeconds;
  const projection = elapsedSeconds <= 0
    ? usedPercentage
    : Math.min(100, Math.round((usedPercentage * periodSeconds) / elapsedSeconds));

  return {
    stale: false,
    usedPercentage,
    projectedPercentage: projection > usedPercentage ? projection : null,
    resetsAt: window.resets_at,
    observedAt: window.observed_at ?? null,
    remainingSeconds,
  };
};
