import { describe, expect, it } from 'vitest';
import { calculateSafeSpacerShrink, calculateTimelineSpacerHeight } from '@/lib/timeline-spacer';

describe('timeline spacer calculations', () => {
  it('clamps spacer height when content exceeds the viewport', () => {
    expect(calculateTimelineSpacerHeight(500, 100, 450, 12)).toBe(0);
    expect(calculateTimelineSpacerHeight(500, 100, 100, 12)).toBe(288);
  });

  it('never shrinks beyond available scroll headroom or below zero', () => {
    expect(calculateSafeSpacerShrink(300, 0, 80)).toBe(220);
    expect(calculateSafeSpacerShrink(50, 20, 500)).toBe(20);
    expect(calculateSafeSpacerShrink(-10, -20, -1)).toBe(0);
  });
});
