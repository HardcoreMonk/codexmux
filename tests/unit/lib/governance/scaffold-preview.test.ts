import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScaffoldPreviewService } from '@/lib/governance/scaffold-preview';
import {
  renderScaffoldAdoptionTemplate,
  renderScaffoldTemplate,
} from '@/lib/governance/scaffold-template-catalog';
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

  it('classifies missing, marker-owned, adoption-available, and skipped artifacts without returning absolute paths', async () => {
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
      state: 'adoption-available', errorCode: null, path: 'AGENTS.md',
    });
    expect(preview.artifacts.find((item) => item.id === 'context')).toMatchObject({ state: 'marker-update' });
    expect(preview.artifacts.find((item) => item.id === 'agent-domain')).toMatchObject({ state: 'create' });
    expect(preview.artifacts.find((item) => item.id === 'design')).toMatchObject({ state: 'skipped' });
    expect(JSON.stringify(preview)).not.toContain(tempRoot);
  });

  it('requires a second preview and adopts only explicitly selected unmarked artifacts', async () => {
    const original = Buffer.from('# User-owned guidance\n\nKeep this paragraph.\n');
    await fs.writeFile(path.join(projectPath, 'AGENTS.md'), original);
    const service = createScaffoldPreviewService({
      randomToken: () => 'g'.repeat(32),
      readMountInfo: async () => '',
    });
    const request = {
      project,
      root,
      artifacts: ['agents', 'context'] as const,
      input: { title: 'Demo', summary: 'Current summary', uiProject: false },
    };
    const first = await service.createPreview({ ...request, artifacts: [...request.artifacts] });

    expect(first.artifacts.find((item) => item.id === 'agents')).toMatchObject({
      state: 'adoption-available', templateId: 'project-agents-adopted', diff: '', bytes: 0,
    });
    await expect(service.confirmPreview({
      token: first.token, digest: first.digest, project, root, confirmation: project.title,
    })).rejects.toMatchObject({ code: 'scaffold-adoption-selection-required' });

    const second = await service.createPreview({
      ...request,
      artifacts: [...request.artifacts],
      adoptArtifacts: ['agents'],
    });
    expect(second.digest).not.toBe(first.digest);
    expect(second.artifacts.find((item) => item.id === 'agents')).toMatchObject({
      state: 'adopt', templateId: 'project-agents-adopted', errorCode: null,
    });
    const confirmed = await service.confirmPreview({
      token: second.token, digest: second.digest, project, root, confirmation: project.title,
    });
    const adoption = confirmed.artifacts.find((item) => item.id === 'agents');
    expect(adoption).toMatchObject({ state: 'adopt', templateId: 'project-agents-adopted' });
    expect(Buffer.from(adoption?.output ?? '').subarray(0, original.length)).toEqual(original);
  });

  it('updates an existing adoption marker without switching template variants', async () => {
    const input = { title: 'Demo', summary: 'Current summary', uiProject: false };
    const prefix = '# Existing context\n\n';
    await fs.writeFile(
      path.join(projectPath, 'CONTEXT.md'),
      `${prefix}${renderScaffoldAdoptionTemplate('context', input).replace('canonical term', 'preferred term')}`,
    );
    const service = createScaffoldPreviewService({ randomToken: () => 'h'.repeat(32), readMountInfo: async () => '' });
    const preview = await service.createPreview({ project, root, artifacts: ['context'], input });

    expect(preview.artifacts.find((item) => item.id === 'context')).toMatchObject({
      state: 'marker-update', templateId: 'project-context-adopted', fromVersion: 1,
    });
    const confirmed = await service.confirmPreview({
      token: preview.token, digest: preview.digest, project, root, confirmation: project.title,
    });
    expect(confirmed.artifacts[0]?.output.startsWith(prefix)).toBe(true);
    expect(confirmed.artifacts[0]?.templateId).toBe('project-context-adopted');
  });

  it('rejects adoption intent for missing or already owned targets', async () => {
    const service = createScaffoldPreviewService({ randomToken: () => 'i'.repeat(32), readMountInfo: async () => '' });
    const input = { title: 'Demo', summary: 'Current summary', uiProject: false };
    const missing = await service.createPreview({
      project, root, artifacts: ['context'], adoptArtifacts: ['context'], input,
    });
    expect(missing.artifacts[1]).toMatchObject({
      id: 'context', state: 'conflict', errorCode: 'scaffold-adoption-target-missing',
    });

    await fs.writeFile(path.join(projectPath, 'CONTEXT.md'), renderScaffoldTemplate('context', input));
    const owned = await service.createPreview({
      project, root, artifacts: ['context'], adoptArtifacts: ['context'], input,
    });
    expect(owned.artifacts[1]).toMatchObject({
      id: 'context', state: 'conflict', errorCode: 'scaffold-adoption-target-owned',
    });
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
