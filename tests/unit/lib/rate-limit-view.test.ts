import { describe, expect, it } from 'vitest';
import { getRateLimitWindowView } from '@/lib/rate-limit-view';

describe('getRateLimitWindowView', () => {
  it('projects an active window without changing the observed value', () => {
    const view = getRateLimitWindowView({
      used_percentage: 25,
      resets_at: 10_000,
      observed_at: 1_000,
    }, '5h', 1_000_000);

    expect(view.stale).toBe(false);
    expect(view.usedPercentage).toBe(25);
    expect(view.projectedPercentage).toBeGreaterThan(25);
    expect(view.observedAt).toBe(1_000);
  });

  it('marks an expired window stale without synthesizing a new reset or zero usage', () => {
    const view = getRateLimitWindowView({
      used_percentage: 78,
      resets_at: 100,
      observed_at: 1_000,
    }, '7d', 101_000);

    expect(view).toMatchObject({
      stale: true,
      usedPercentage: 78,
      projectedPercentage: null,
      resetsAt: 100,
      remainingSeconds: 0,
    });
  });
});
