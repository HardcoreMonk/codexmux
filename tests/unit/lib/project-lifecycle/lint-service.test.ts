import { describe, expect, it } from 'vitest';
import { lintProjectLifecycle } from '@/lib/project-lifecycle/lint-service';

describe('project lifecycle lint', () => {
  it('reports missing prerequisite artifacts with relative paths only', () => {
    const result = lintProjectLifecycle('project-1', ['docs/superpowers/plans/feature.md']);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      { code: 'plan-without-spec', artifactPath: 'docs/superpowers/plans/feature.md' },
    ]));
    expect(JSON.stringify(result)).not.toContain('/home/');
  });
});
