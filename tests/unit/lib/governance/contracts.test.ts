import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvedProjectRootSchema,
  lifecycleEvidenceSchema,
  lifecycleLintResultSchema,
  managedProjectSchema,
  projectDocumentRefSchema,
  projectGovernanceSummarySchema,
  projectIdSchema,
  projectLifecycleSnapshotSchema,
  relativeDocumentPathSchema,
} from '@/lib/governance/contracts';

const project = {
  id: 'project-1',
  approvedRootId: 'root-1',
  title: 'codexmux',
  relativePath: 'codexmux',
  source: 'manual',
  createdAt: '2026-08-21T08:00:00.000Z',
  updatedAt: '2026-08-21T08:00:00.000Z',
};

describe('governance contracts', () => {
  it('accepts bounded project ids and contained relative document paths', () => {
    expect(projectIdSchema.parse('project:codexmux')).toBe('project:codexmux');
    expect(relativeDocumentPathSchema.parse('docs/ADR.md')).toBe('docs/ADR.md');
  });

  it('rejects absolute paths, traversal and platform separators', () => {
    for (const path of ['/etc/passwd', '../AGENTS.md', 'docs/../../secret', 'docs\\ADR.md', 'docs//ADR.md']) {
      expect(relativeDocumentPathSchema.safeParse(path).success).toBe(false);
    }
    expect(projectIdSchema.safeParse('project id').success).toBe(false);
  });

  it('validates approved roots and managed projects without absolute path disclosure', () => {
    expect(approvedProjectRootSchema.parse({
      id: 'root-1',
      label: 'Codex zone',
      approvedAt: '2026-08-21T08:00:00.000Z',
    })).toMatchObject({ id: 'root-1' });
    expect(managedProjectSchema.parse(project)).toEqual(project);

    for (const prohibited of ['canonicalPath', 'absolutePath', 'documentBody']) {
      expect(managedProjectSchema.safeParse({ ...project, [prohibited]: '/secret' }).success).toBe(false);
    }
  });

  it('validates bounded document and governance read models', () => {
    const document = {
      projectId: 'project-1',
      path: 'docs/ADR.md',
      kind: 'adr',
      title: 'Architecture decisions',
      headings: ['ADR-031'],
      fingerprint: 'sha256:abc123',
      lintStatus: 'clean',
    };
    expect(projectDocumentRefSchema.parse(document)).toEqual(document);
    expect(projectDocumentRefSchema.safeParse({ ...document, content: 'full document' }).success).toBe(false);
    expect(projectGovernanceSummarySchema.parse({
      project,
      engine: 'linux-single-host',
      readOnly: true,
      documentCount: 12,
      warningCount: 1,
      lifecycleStage: 'implement',
      indexState: 'ready',
      indexedAt: '2026-08-21T08:10:00.000Z',
    })).toMatchObject({ readOnly: true, documentCount: 12 });
  });

  it('keeps project lifecycle evidence separate from ADR state', () => {
    expect(lifecycleEvidenceSchema.parse({
      projectId: 'project-1',
      stage: 'implement',
      state: 'complete',
      artifactPath: 'docs/superpowers/plans/plan.md',
      fingerprint: 'sha256:def456',
    })).toMatchObject({ stage: 'implement', state: 'complete' });
    expect(lifecycleEvidenceSchema.safeParse({
      projectId: 'project-1',
      stage: 'Approved',
      state: 'complete',
      artifactPath: 'docs/ADR.md',
      fingerprint: 'sha256:def456',
    }).success).toBe(false);
    expect(lifecycleLintResultSchema.parse({
      projectId: 'project-1',
      valid: false,
      errors: [{ code: 'missing-plan', artifactPath: null }],
      warnings: [],
    })).toMatchObject({ valid: false });
  });

  it('accepts lifecycle evidence up to the project document response bound', () => {
    const evidence = Array.from({ length: 201 }, (_, index) => ({
      projectId: 'project-1',
      stage: 'operate' as const,
      state: 'complete' as const,
      artifactPath: `docs/operations/handoff-${index}.md`,
      fingerprint: `sha256:${index.toString(16).padStart(64, '0')}`,
    }));
    const snapshot = {
      projectId: 'project-1',
      stage: 'operate' as const,
      evidence,
      lint: {
        projectId: 'project-1',
        valid: true,
        errors: [],
        warnings: [],
      },
    };

    expect(projectLifecycleSnapshotSchema.parse(snapshot).evidence).toHaveLength(201);
    expect(projectLifecycleSnapshotSchema.safeParse({
      ...snapshot,
      evidence: Array.from({ length: 2_001 }, () => evidence[0]),
    }).success).toBe(false);
  });

  it('keeps governance registry fixtures bounded and synthetic', () => {
    const content = readFileSync(resolve(process.cwd(), 'tests/fixtures/governance/projects.yaml'), 'utf8');
    expect(content).toContain('projects:');
    expect(content).toContain('duplicate-path');
    expect(content).toContain('unsupported: [inline, list]');
    expect(content).not.toMatch(/\/home\//);
  });
});
