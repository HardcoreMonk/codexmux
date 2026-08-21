import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScaffoldPreviewService } from '@/lib/governance/scaffold-preview';
import { renderScaffoldTemplate } from '@/lib/governance/scaffold-template-catalog';
import type { IApprovedProjectRootSnapshot, IManagedProjectSnapshot } from '@/lib/governance/contracts';

describe('governance scaffold preview', () => {
  let tempRoot: string;
  let projectPath: string;
  let root: IApprovedProjectRootSnapshot;
  let project: IManagedProjectSnapshot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-scaffold-preview-'));
    projectPath = path.join(tempRoot, 'demo');
    await fs.mkdir(projectPath);
    root = { id: 'root-1', label: 'Projects', canonicalPath: tempRoot, approvedAt: '2026-08-21T00:00:00.000Z' };
    project = {
      id: 'project-1', approvedRootId: root.id, title: 'Demo', relativePath: 'demo', canonicalPath: projectPath,
      source: 'manual', createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z',
    };
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('classifies missing, marker-owned, unmarked, and skipped artifacts without returning absolute paths', async () => {
    await fs.writeFile(path.join(projectPath, 'CONTEXT.md'), renderScaffoldTemplate('context', {
      title: 'Old', summary: 'Old summary', uiProject: false,
    }));
    await fs.writeFile(path.join(projectPath, 'AGENTS.md'), '# User-owned guidance\n');
    const service = createScaffoldPreviewService({
      randomToken: () => 'c'.repeat(32),
      readMountInfo: async () => '',
    });
    const preview = await service.createPreview({
      project,
      root,
      artifacts: ['agents', 'context', 'agent-domain'],
      input: { title: 'Demo', summary: 'Current summary', uiProject: false },
    });

    expect(preview.artifacts.find((item) => item.id === 'agents')).toMatchObject({
      state: 'conflict', errorCode: 'unmarked-file-conflict', path: 'AGENTS.md',
    });
    expect(preview.artifacts.find((item) => item.id === 'context')).toMatchObject({ state: 'marker-update' });
    expect(preview.artifacts.find((item) => item.id === 'agent-domain')).toMatchObject({ state: 'create' });
    expect(preview.artifacts.find((item) => item.id === 'design')).toMatchObject({ state: 'skipped' });
    expect(JSON.stringify(preview)).not.toContain(tempRoot);
  });

  it('invalidates the complete preview when a target changes', async () => {
    const service = createScaffoldPreviewService({ randomToken: () => 'd'.repeat(32), readMountInfo: async () => '' });
    const preview = await service.createPreview({
      project, root, artifacts: ['context'],
      input: { title: 'Demo', summary: 'Current summary', uiProject: false },
    });
    await fs.writeFile(path.join(projectPath, 'CONTEXT.md'), '# External writer\n');
    await expect(service.confirmPreview({
      token: preview.token, digest: preview.digest, project, root, confirmation: project.title,
    })).rejects.toMatchObject({ code: 'stale-preview' });
  });

  it('requires exact project title confirmation', async () => {
    const service = createScaffoldPreviewService({ randomToken: () => 'e'.repeat(32), readMountInfo: async () => '' });
    const preview = await service.createPreview({
      project, root, artifacts: ['context'],
      input: { title: 'Demo', summary: 'Current summary', uiProject: false },
    });
    await expect(service.confirmPreview({
      token: preview.token, digest: preview.digest, project, root, confirmation: 'demo',
    })).rejects.toMatchObject({ code: 'confirmation-mismatch' });
  });

  it('does not create an empty action for an unchanged marker-owned artifact', async () => {
    const input = { title: 'Demo', summary: 'Current summary', uiProject: false };
    await fs.writeFile(path.join(projectPath, 'CONTEXT.md'), renderScaffoldTemplate('context', input));
    const service = createScaffoldPreviewService({ randomToken: () => 'f'.repeat(32), readMountInfo: async () => '' });
    const preview = await service.createPreview({ project, root, artifacts: ['context'], input });
    expect(preview.artifacts.find((artifact) => artifact.id === 'context')).toMatchObject({ state: 'unchanged' });
    await expect(service.confirmPreview({
      token: preview.token, digest: preview.digest, project, root, confirmation: project.title,
    })).rejects.toMatchObject({ code: 'scaffold-no-changes' });
  });
});
