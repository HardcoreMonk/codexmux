import { describe, expect, it } from 'vitest';
import {
  scaffoldPreviewInputSchema,
  scaffoldArtifactIdSchema,
  scaffoldActionSummarySchema,
} from '@/lib/governance/scaffold-contracts';

describe('governance scaffold contracts', () => {
  it('accepts only catalog artifact ids and bounded template input', () => {
    expect(scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents', 'context', 'agent-domain'],
      input: { title: 'Demo', summary: 'Demo project', uiProject: false },
    })).toMatchObject({ projectId: 'project-1', artifacts: ['agents', 'context', 'agent-domain'] });

    expect(() => scaffoldArtifactIdSchema.parse('../README.md')).toThrow();
    expect(() => scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents'],
      input: { title: 'Demo', summary: 'Demo', uiProject: false },
      path: '/tmp/demo',
    })).toThrow();
  });

  it('keeps public action history free of private recovery fields', () => {
    const summary = scaffoldActionSummarySchema.parse({
      id: 'action-1',
      projectId: 'project-1',
      state: 'committed',
      artifactCount: 2,
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:01.000Z',
      errorCode: null,
      indexState: 'ready',
    });
    expect(summary).not.toHaveProperty('canonicalProjectPath');
    expect(summary).not.toHaveProperty('backupPath');
    expect(summary).not.toHaveProperty('preimage');
  });
});
