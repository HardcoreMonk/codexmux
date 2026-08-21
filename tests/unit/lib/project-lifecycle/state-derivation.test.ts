import { describe, expect, it } from 'vitest';
import { deriveProjectLifecycleState } from '@/lib/project-lifecycle/state-derivation';

describe('project lifecycle state derivation', () => {
  it('derives the pipeline from project-local artifacts without treating ADR approval as a stage', () => {
    const result = deriveProjectLifecycleState('project-1', [
      'docs/adr/031.md',
      'docs/superpowers/specs/feature.md',
      'docs/superpowers/grill-me/feature.md',
      'docs/superpowers/plans/feature.md',
      'docs/superpowers/reviews/feature-eng-review.md',
    ]);
    expect(result.stage).toBe('implement');
    expect(result.evidence.map((item) => item.stage)).toEqual(expect.arrayContaining([
      'writing-spec', 'grill-me', 'writing-plans', 'plan-eng-review',
    ]));
    expect(result.evidence.map((item) => item.stage)).not.toContain('Approved');
  });
});
