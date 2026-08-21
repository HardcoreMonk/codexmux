import { describe, expect, it } from 'vitest';
import { createAdoptionRepreviewRequest } from '@/hooks/use-governance-scaffold';
import type { IScaffoldPreview } from '@/lib/governance/scaffold-contracts';

const preview: IScaffoldPreview = {
  token: 'a'.repeat(32),
  digest: `sha256:${'a'.repeat(64)}`,
  projectId: 'project-1',
  projectTitle: 'Demo',
  expiresAt: Date.now() + 60_000,
  artifacts: [
    {
      id: 'agents', path: 'AGENTS.md', templateId: 'project-agents-adopted', fromVersion: null,
      toVersion: 1, state: 'adoption-available', diff: '', bytes: 0, errorCode: null,
    },
    {
      id: 'context', path: 'CONTEXT.md', templateId: 'project-context', fromVersion: null,
      toVersion: 1, state: 'create', diff: 'diff', bytes: 100, errorCode: null,
    },
    {
      id: 'agent-domain', path: 'docs/agents/domain.md', templateId: 'agent-domain-adopted', fromVersion: null,
      toVersion: 1, state: 'adoption-available', diff: '', bytes: 0, errorCode: null,
    },
  ],
  totalBytes: 100,
};

const request = {
  artifacts: ['agents', 'context', 'agent-domain'] as const,
  adoptArtifacts: [],
  input: { title: 'Demo', summary: 'Summary', uiProject: false },
};

describe('governance scaffold adoption re-preview', () => {
  it('removes every discovery row and re-adds only explicitly selected adoptions', () => {
    expect(createAdoptionRepreviewRequest(preview, {
      ...request,
      artifacts: [...request.artifacts],
    }, ['agents'])).toEqual({
      artifacts: ['agents', 'context'],
      adoptArtifacts: ['agents'],
      input: request.input,
    });
  });

  it('continues with other changes when every adoption remains unchecked', () => {
    expect(createAdoptionRepreviewRequest(preview, {
      ...request,
      artifacts: [...request.artifacts],
    }, [])).toEqual({
      artifacts: ['context'],
      adoptArtifacts: [],
      input: request.input,
    });
  });
});
