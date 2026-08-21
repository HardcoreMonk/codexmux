import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openKnowledgeIndex } from '@/lib/governance/knowledge-index';

describe('governance Knowledge Index', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-knowledge-index-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('stores only document metadata and link edges, never full body', async () => {
    const dbPath = path.join(dir, 'governance', 'index.db');
    const index = openKnowledgeIndex(dbPath);
    index.replaceProjectDocuments('project-1', [{
      projectId: 'project-1', path: 'AGENTS.md', kind: 'agents', title: 'Guidance', headings: ['Guidance'],
      fingerprint: 'sha256:abc123', lintStatus: 'clean', links: ['docs/ADR.md'], content: 'PRIVATE BODY',
    }]);

    expect(index.listProjectDocuments('project-1')).toEqual([{
      projectId: 'project-1', path: 'AGENTS.md', kind: 'agents', title: 'Guidance', headings: ['Guidance'],
      fingerprint: 'sha256:abc123', lintStatus: 'clean',
    }]);
    expect(index.listProjectLinks('project-1')).toEqual([{ sourcePath: 'AGENTS.md', targetPath: 'docs/ADR.md' }]);
    const schema = index.inspectSchemaSql();
    expect(schema).not.toMatch(/\b(?:body|content|secret)\b/i);
    expect(JSON.stringify(index.listProjectDocuments('project-1'))).not.toContain('PRIVATE BODY');
    index.close();
    expect((await fs.stat(dbPath)).mode & 0o077).toBe(0);
  });
});
