import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntimeCommand, runtimeCommandRegistry } from '@/lib/runtime/ipc';
import { createGovernanceWorkerService } from '@/lib/runtime/governance/worker-service';

describe('governance worker service', () => {
  let dir: string;
  let service: ReturnType<typeof createGovernanceWorkerService>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-governance-worker-'));
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(path.join(projectRoot, 'docs', 'superpowers', 'specs'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), '# Guidance\n');
    await fs.writeFile(path.join(projectRoot, 'docs', 'superpowers', 'specs', 'feature.md'), '# Feature\n');
    service = createGovernanceWorkerService({ indexPath: path.join(dir, 'index.db') });
  });

  afterEach(async () => {
    service?.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('refreshes Storage-provided snapshots and serves bounded read models', async () => {
    const snapshot = {
      id: 'project-1', approvedRootId: 'root-1', title: 'Demo', relativePath: 'project',
      canonicalPath: path.join(dir, 'project'), source: 'manual' as const,
      createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
    };
    const refresh = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor', target: 'governance', type: 'governance.refresh-projects', payload: { projects: [snapshot] },
    }));
    const summary = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor', target: 'governance', type: 'governance.get-project-summary', payload: { projectId: 'project-1' },
    }));
    const documents = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor', target: 'governance', type: 'governance.list-project-documents', payload: { projectId: 'project-1' },
    }));

    expect(refresh).toMatchObject({ ok: true, payload: { refreshed: 1, failed: 0 } });
    expect(summary).toMatchObject({
      ok: true,
      payload: { project: { id: 'project-1' }, engine: 'linux-single-host', readOnly: true, documentCount: 2 },
    });
    expect(documents).toMatchObject({ ok: true, payload: [
      { path: 'AGENTS.md', kind: 'agents' },
      { path: 'docs/superpowers/specs/feature.md', kind: 'spec' },
    ] });
  });

  it('keeps project filesystem mutation commands out of the registry', () => {
    const names = Object.keys(runtimeCommandRegistry);
    expect(names).toContain('governance.refresh-projects');
    expect(names.some((name) => /^governance\.(?:write|delete|move|scaffold|sync)/.test(name))).toBe(false);
  });

  it('revalidates indexed documents against binary and symlink changes before detail reads', async () => {
    const projectRoot = path.join(dir, 'project');
    const snapshot = {
      id: 'project-1', approvedRootId: 'root-1', title: 'Demo', relativePath: 'project',
      canonicalPath: projectRoot, source: 'manual' as const,
      createdAt: '2026-08-21T10:00:00.000Z', updatedAt: '2026-08-21T10:00:00.000Z',
    };
    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor', target: 'governance', type: 'governance.refresh-projects', payload: { projects: [snapshot] },
    }));
    await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), Buffer.from([0, 1, 2]));
    const binary = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor', target: 'governance', type: 'governance.read-project-document',
      payload: { projectId: 'project-1', path: 'AGENTS.md' },
    }));
    expect(binary).toMatchObject({ ok: false, error: { code: 'project-document-binary' } });

    await fs.rm(path.join(projectRoot, 'AGENTS.md'));
    await fs.symlink(path.join(projectRoot, 'docs', 'superpowers', 'specs', 'feature.md'), path.join(projectRoot, 'AGENTS.md'));
    const linked = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor', target: 'governance', type: 'governance.read-project-document',
      payload: { projectId: 'project-1', path: 'AGENTS.md' },
    }));
    expect(linked).toMatchObject({ ok: false, error: { code: 'project-document-not-regular' } });
  });
});
