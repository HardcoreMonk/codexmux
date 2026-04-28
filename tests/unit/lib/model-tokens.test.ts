import { describe, expect, it } from 'vitest';

import {
  calculateCost,
  calculateCostByFullId,
  formatModelDisplayName,
  normalizeModelName,
} from '@/lib/model-tokens';

describe('model token helpers', () => {
  it('normalizes and formats OpenAI model names', () => {
    expect(normalizeModelName('gpt-5.5-2026-04-23')).toBe('gpt-5.5');
    expect(formatModelDisplayName('gpt-5.2-codex')).toBe('GPT-5.2 Codex');
  });

  it('uses OpenAI pricing for Codex models', () => {
    expect(calculateCostByFullId('gpt-5.5', 1_000_000, 1_000_000, 0, 0, 1_000_000)).toBe(35.5);
    expect(calculateCostByFullId('gpt-5.2-codex', 1_000_000, 1_000_000, 0, 0, 1_000_000)).toBeCloseTo(15.925);
  });

  it('does not estimate unknown model costs from unrelated rates', () => {
    expect(calculateCost('unknown-model', 1, 1, 0, 0, 0)).toBeNull();
    expect(calculateCostByFullId('unknown-model', 1, 1, 0, 0, 0)).toBe(0);
  });
});
