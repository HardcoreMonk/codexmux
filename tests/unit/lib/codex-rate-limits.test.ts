import { describe, expect, it } from 'vitest';
import {
  findLatestCodexRateLimits,
  mergeRateLimitsData,
  parseCodexRateLimitsRecord,
} from '@/lib/codex-rate-limits';

describe('parseCodexRateLimitsRecord', () => {
  it('normalizes legacy payload windows', () => {
    expect(parseCodexRateLimitsRecord({
      type: 'event_msg',
      timestamp: '2026-08-14T00:00:00.000Z',
      payload: {
        type: 'token_count',
        rate_limits: {
          primary: { used_percent: 12.5, window_minutes: 300, resets_in_seconds: 60 },
          secondary: { used_percentage: 150, window_minutes: 10_080, resets_at: 2_000_000_000 },
        },
      },
    })).toEqual({
      ts: 1_786_665_600_000,
      five_hour: {
        used_percentage: 12.5,
        resets_at: 1_786_665_660,
        observed_at: 1_786_665_600_000,
      },
      seven_day: {
        used_percentage: 100,
        resets_at: 2_000_000_000,
        observed_at: 1_786_665_600_000,
      },
    });
  });

  it('reads current top-level limits and classifies primary by duration', () => {
    expect(parseCodexRateLimitsRecord({
      type: 'event_msg',
      timestamp: '2026-08-20T13:49:22.509Z',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 61_066, output_tokens: 744 } },
      },
      rate_limits: {
        limit_id: 'codex',
        primary: {
          used_percent: 5,
          window_minutes: 10_080,
          resets_at: 1_787_819_443,
        },
        secondary: null,
      },
    })).toEqual({
      ts: 1_787_233_762_509,
      five_hour: null,
      seven_day: {
        used_percentage: 5,
        resets_at: 1_787_819_443,
        observed_at: 1_787_233_762_509,
      },
    });
  });

  it('recognizes windows by duration and clamps negative usage', () => {
    const result = parseCodexRateLimitsRecord({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        rate_limits: {
          first: { used_percentage: -5, window_minutes: 300, resets_at: 100 },
          second: { used_percentage: 25, window_minutes: 10_080, resets_at: 200 },
        },
      },
    }, 50_000);

    expect(result?.five_hour?.used_percentage).toBe(0);
    expect(result?.seven_day?.used_percentage).toBe(25);
    expect(result?.ts).toBe(50_000);
  });

  it('does not misclassify a duration-tagged primary window', () => {
    const result = parseCodexRateLimitsRecord({
      type: 'event_msg',
      payload: { type: 'token_count' },
      rate_limits: {
        primary: { used_percent: 25, window_minutes: 10_080, resets_at: 200 },
      },
    }, 50_000);

    expect(result?.five_hour).toBeNull();
    expect(result?.seven_day?.used_percentage).toBe(25);
  });

  it('ignores unrelated, malformed, and empty observations', () => {
    expect(parseCodexRateLimitsRecord(null)).toBeNull();
    expect(parseCodexRateLimitsRecord({ type: 'event_msg', payload: { type: 'message' } })).toBeNull();
    expect(parseCodexRateLimitsRecord({
      type: 'event_msg',
      payload: { type: 'token_count', rate_limits: { primary: { used_percent: 10 } } },
    })).toBeNull();
  });
});

describe('rate limit observation merging', () => {
  it('keeps independently newer windows', () => {
    const current = {
      ts: 2_000,
      five_hour: { used_percentage: 20, resets_at: 100, observed_at: 2_000 },
      seven_day: { used_percentage: 30, resets_at: 200, observed_at: 2_000 },
    };
    const merged = mergeRateLimitsData(current, {
      ts: 3_000,
      five_hour: { used_percentage: 40, resets_at: 300, observed_at: 3_000 },
      seven_day: null,
    });

    expect(merged.five_hour?.used_percentage).toBe(40);
    expect(merged.seven_day?.used_percentage).toBe(30);
  });

  it('finds the newest valid windows across malformed JSONL', () => {
    const content = [
      '{bad',
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-08-14T00:00:00.000Z',
        payload: {
          type: 'token_count',
          rate_limits: { primary: { used_percent: 10, resets_at: 100 } },
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-08-14T00:01:00.000Z',
        payload: {
          type: 'token_count',
          rate_limits: { secondary: { used_percent: 20, resets_at: 200 } },
        },
      }),
    ].join('\n');

    const result = findLatestCodexRateLimits(content);
    expect(result?.five_hour?.used_percentage).toBe(10);
    expect(result?.seven_day?.used_percentage).toBe(20);
    expect(result?.ts).toBe(1_786_665_660_000);
  });
});
