import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverProjectDocuments } from '@/lib/governance/document-discovery';

describe('governance document discovery', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-document-discovery-'));
    await fs.mkdir(path.join(dir, 'docs', 'adr'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'superpowers', 'specs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'node_modules', 'ignored'), { recursive: true });
    await fs.mkdir(path.join(dir, 'vendor-worktree'), { recursive: true });
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Agent Guidance\n\nUse TypeScript.\n');
    await fs.writeFile(path.join(dir, 'CONTEXT.md'), '# Context\n\nSee [ADR](docs/adr/001.md).\n');
    await fs.writeFile(path.join(dir, 'docs', 'adr', '001.md'), '# ADR-001\n\nDecision.\n');
    await fs.writeFile(path.join(dir, 'docs', 'superpowers', 'specs', 'feature.md'), '# Feature Spec\n');
    await fs.writeFile(path.join(dir, 'node_modules', 'ignored', 'AGENTS.md'), '# Ignore me\n');
    await fs.writeFile(path.join(dir, 'vendor-worktree', '.git'), 'gitdir: ../.git/worktrees/vendor\n');
    await fs.writeFile(path.join(dir, 'vendor-worktree', 'AGENTS.md'), '# Nested worktree\n');
    await fs.writeFile(path.join(dir, 'docs', 'binary.md'), Buffer.from([0, 1, 2, 3]));
    await fs.symlink(path.join(dir, 'AGENTS.md'), path.join(dir, 'docs', 'linked.md'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('classifies bounded project documents and ignores excluded, binary, and symlink files', async () => {
    const result = await discoverProjectDocuments({ projectId: 'project-1', projectRoot: dir });
    expect(result.partial).toBe(false);
    expect(result.documents.map(({ path: documentPath, kind, title }) => ({ documentPath, kind, title }))).toEqual([
      { documentPath: 'AGENTS.md', kind: 'agents', title: 'Agent Guidance' },
      { documentPath: 'CONTEXT.md', kind: 'context', title: 'Context' },
      { documentPath: 'docs/adr/001.md', kind: 'adr', title: 'ADR-001' },
      { documentPath: 'docs/superpowers/specs/feature.md', kind: 'spec', title: 'Feature Spec' },
    ]);
    expect(result.documents.find((document) => document.path === 'CONTEXT.md')?.links).toEqual(['docs/adr/001.md']);
    expect(result.documents.every((document) => !document.path.includes('node_modules'))).toBe(true);
    expect(result.documents.every((document) => !document.path.includes('vendor-worktree'))).toBe(true);
    expect(result.documents.every((document) => document.fingerprint.startsWith('sha256:'))).toBe(true);
  });

  it('marks quota exhaustion as partial without returning unbounded content', async () => {
    const result = await discoverProjectDocuments({
      projectId: 'project-1', projectRoot: dir,
      limits: { maxFiles: 2, maxFileBytes: 64, maxTotalBytes: 128, maxDepth: 4, timeoutMs: 5_000 },
    });
    expect(result.partial).toBe(true);
    expect(result.documents).toHaveLength(2);
    expect(result.warnings).toContain('file-count-limit');
  });
});
