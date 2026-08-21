import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScaffoldBackup } from '@/lib/governance/scaffold-backup';

describe('scaffold backup', () => {
  let backupRoot: string;
  let targetRoot: string;

  beforeEach(async () => {
    backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-scaffold-backup-'));
    targetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-scaffold-target-'));
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(backupRoot, { recursive: true, force: true }),
      fs.rm(targetRoot, { recursive: true, force: true }),
    ]);
  });

  it('copies an exact private preimage and records absence for creates', async () => {
    const existing = path.join(targetRoot, 'CONTEXT.md');
    await fs.writeFile(existing, 'existing bytes\n', { mode: 0o640 });
    const backup = await createScaffoldBackup({
      backupRoot,
      projectId: 'project-1',
      actionId: 'action-1',
      artifacts: [
        { id: 'context', absolutePath: existing, baseFingerprint: 'sha256:ignored', state: 'marker-update' },
        { id: 'agent-domain', absolutePath: path.join(targetRoot, 'docs/agents/domain.md'), baseFingerprint: 'absent', state: 'create' },
      ],
    });
    expect(await fs.readFile(backup.artifacts[0]!.preimagePath!, 'utf8')).toBe('existing bytes\n');
    expect(backup.artifacts[0]).toMatchObject({ targetMode: 0o640 });
    expect(backup.artifacts[1]).toMatchObject({ preimagePath: null, targetMode: 0o644 });
    expect((await fs.stat(backup.actionDir)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(backup.artifacts[0]!.preimagePath!)).mode & 0o777).toBe(0o600);
  });
});
