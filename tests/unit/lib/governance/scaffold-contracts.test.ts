import { describe, expect, it } from 'vitest';
import {
  scaffoldPreviewInputSchema,
  scaffoldArtifactIdSchema,
  scaffoldArtifactPreviewSchema,
  scaffoldActionSummarySchema,
} from '@/lib/governance/scaffold-contracts';

describe('governance scaffold contracts', () => {
  it('accepts only catalog artifact ids and bounded template input', () => {
    expect(scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents', 'context', 'agent-domain'],
      input: { title: 'Demo', summary: 'Demo project', uiProject: false },
    })).toMatchObject({
      projectId: 'project-1',
      artifacts: ['agents', 'context', 'agent-domain'],
      adoptArtifacts: [],
    });

    expect(() => scaffoldArtifactIdSchema.parse('../README.md')).toThrow();
    expect(() => scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents'],
      input: { title: 'Demo', summary: 'Demo', uiProject: false },
      path: '/tmp/demo',
    })).toThrow();
  });

  it('requires adoption selections to be unique artifact subsets', () => {
    expect(scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents', 'context'],
      adoptArtifacts: ['agents'],
      input: { title: 'Demo', summary: 'Demo project', uiProject: false },
    }).adoptArtifacts).toEqual(['agents']);

    expect(() => scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents'],
      adoptArtifacts: ['context'],
      input: { title: 'Demo', summary: 'Demo project', uiProject: false },
    })).toThrow();
    expect(() => scaffoldPreviewInputSchema.parse({
      projectId: 'project-1',
      artifacts: ['agents'],
      adoptArtifacts: ['agents', 'agents'],
      input: { title: 'Demo', summary: 'Demo project', uiProject: false },
    })).toThrow();
  });

  it('accepts discovery and confirmed adoption preview states', () => {
    const base = {
      id: 'agents',
      path: 'AGENTS.md',
      templateId: 'project-agents-adopted',
      fromVersion: null,
      toVersion: 1,
      diff: '',
      bytes: 0,
      errorCode: null,
    };
    expect(scaffoldArtifactPreviewSchema.parse({ ...base, state: 'adoption-available' }).state)
      .toBe('adoption-available');
    expect(scaffoldArtifactPreviewSchema.parse({ ...base, state: 'adopt' }).state).toBe('adopt');
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
