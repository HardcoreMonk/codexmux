import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createScaffoldActionJournal,
  toGovernanceActionSummary,
  type IScaffoldActionManifest,
} from '@/lib/governance/scaffold-action-journal';

describe('scaffold action journal', () => {
  let backupRoot: string;

  beforeEach(async () => {
    backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-scaffold-journal-'));
  });

  afterEach(async () => {
    await fs.rm(backupRoot, { recursive: true, force: true });
  });

  it('persists a private 0600 manifest and returns a sanitized summary', async () => {
    const journal = createScaffoldActionJournal({ backupRoot });
    const manifest: IScaffoldActionManifest = {
      version: 1,
      id: 'action-1',
      projectId: 'project-1',
      projectTitle: 'Demo',
      canonicalProjectPath: '/private/projects/demo',
      state: 'preparing',
      artifacts: [],
      createdDirectories: [],
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
      errorCode: null,
      indexState: 'ready',
    };
    await journal.write(manifest);
    expect(await journal.read('project-1', 'action-1')).toEqual(manifest);
    const mode = (await fs.stat(journal.manifestPath('project-1', 'action-1'))).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(JSON.stringify(toGovernanceActionSummary(manifest))).not.toContain('/private/projects/demo');
  });
});
