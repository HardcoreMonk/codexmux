import type { IRateLimitsData, IRateLimitWindow } from '@/types/status';

type TRateLimitRecord = Record<string, unknown>;

const FIVE_HOUR_MINUTES = 300;
const SEVEN_DAY_MINUTES = 10_080;

const asRecord = (value: unknown): TRateLimitRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as TRateLimitRecord
    : null;

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
};

const clampPercentage = (value: number): number => Math.min(100, Math.max(0, value));

const parseRecordTimestamp = (value: unknown, observedAtMs: number): number => {
  if (typeof value !== 'string') return observedAtMs;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : observedAtMs;
};

const parseWindow = (
  value: unknown,
  observedAtMs: number,
): IRateLimitWindow | null => {
  const input = asRecord(value);
  if (!input) return null;

  const used = asFiniteNumber(input.used_percentage) ?? asFiniteNumber(input.used_percent);
  if (used === null) return null;

  const absoluteReset = asFiniteNumber(input.resets_at);
  const resetInSeconds = asFiniteNumber(input.resets_in_seconds);
  const resetsAt = absoluteReset ?? (
    resetInSeconds === null ? null : observedAtMs / 1000 + resetInSeconds
  );
  if (resetsAt === null || resetsAt <= 0) return null;

  return {
    used_percentage: clampPercentage(used),
    resets_at: resetsAt,
    observed_at: observedAtMs,
  };
};

const findWindowByMinutes = (
  limits: TRateLimitRecord,
  windowMinutes: number,
): unknown => Object.values(limits).find((candidate) => {
  const record = asRecord(candidate);
  return record?.window_minutes === windowMinutes;
});

const findLegacyNamedWindow = (
  limits: TRateLimitRecord,
  key: 'primary' | 'secondary',
): unknown => {
  const candidate = asRecord(limits[key]);
  if (!candidate || asFiniteNumber(candidate.window_minutes) !== null) return null;
  return candidate;
};

export const parseCodexRateLimitsRecord = (
  value: unknown,
  observedAtMs = Date.now(),
): IRateLimitsData | null => {
  const record = asRecord(value);
  const payload = asRecord(record?.payload);
  if (!record || !payload || record.type !== 'event_msg' || payload.type !== 'token_count') {
    return null;
  }

  const limits = asRecord(record.rate_limits) ?? asRecord(payload.rate_limits);
  if (!limits) return null;

  const timestamp = parseRecordTimestamp(record.timestamp, observedAtMs);
  const fiveHour = parseWindow(
    findWindowByMinutes(limits, FIVE_HOUR_MINUTES)
      ?? findLegacyNamedWindow(limits, 'primary'),
    timestamp,
  );
  const sevenDay = parseWindow(
    findWindowByMinutes(limits, SEVEN_DAY_MINUTES)
      ?? findLegacyNamedWindow(limits, 'secondary'),
    timestamp,
  );
  if (!fiveHour && !sevenDay) return null;

  return {
    ts: timestamp,
    five_hour: fiveHour,
    seven_day: sevenDay,
  };
};

const chooseWindow = (
  current: IRateLimitWindow | null,
  next: IRateLimitWindow | null,
  currentTs: number,
  nextTs: number,
): IRateLimitWindow | null => {
  if (!next) return current;
  if (!current) return next;
  const currentObservedAt = current.observed_at ?? currentTs;
  const nextObservedAt = next.observed_at ?? nextTs;
  return nextObservedAt >= currentObservedAt ? next : current;
};

export const mergeRateLimitsData = (
  current: IRateLimitsData | null,
  next: IRateLimitsData,
): IRateLimitsData => {
  if (!current) return next;
  return {
    ts: Math.max(current.ts, next.ts),
    five_hour: chooseWindow(current.five_hour, next.five_hour, current.ts, next.ts),
    seven_day: chooseWindow(current.seven_day, next.seven_day, current.ts, next.ts),
  };
};

export const findLatestCodexRateLimits = (
  content: string,
  observedAtMs = Date.now(),
): IRateLimitsData | null => {
  let latest: IRateLimitsData | null = null;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = parseCodexRateLimitsRecord(JSON.parse(line), observedAtMs);
      if (parsed) latest = mergeRateLimitsData(latest, parsed);
    } catch {
      // Partial and malformed JSONL lines are ignored until a later read.
    }
  }
  return latest;
};

export const rateLimitsEqual = (
  left: IRateLimitsData | null,
  right: IRateLimitsData | null,
): boolean => JSON.stringify(left) === JSON.stringify(right);
