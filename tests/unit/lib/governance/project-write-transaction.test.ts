import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectWriteTransaction } from '@/lib/governance/project-write-transaction';
import type { IConfirmedScaffoldPreview } from '@/lib/governance/scaffold-preview';

const fingerprint = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

describe('project write transaction', () => {
  let backupRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-transaction-backup-'));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-transaction-project-'));
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(backupRoot, { recursive: true, force: true }),
      fs.rm(projectRoot, { recursive: true, force: true }),
    ]);
  });

  const preview = (artifacts: Array<{ path: string; output: string }>): IConfirmedScaffoldPreview => ({
    projectId: 'project-1',
    projectTitle: 'Demo',
    canonicalProjectPath: projectRoot,
    digest: fingerprint('preview'),
    artifacts: artifacts.map((artifact, index) => ({
      id: index === 0 ? 'context' : 'agent-domain',
      path: artifact.path,
      absolutePath: path.join(projectRoot, artifact.path),
      templateId: index === 0 ? 'project-context' : 'agent-domain',
      fromVersion: null,
      toVersion: 1,
      state: 'create',
      output: artifact.output,
      baseFingerprint: 'absent',
      outputFingerprint: fingerprint(artifact.output),
      missingDirectories: artifact.path.includes('/')
        ? [path.dirname(path.join(projectRoot, artifact.path))]
        : [],
    })),
  });

  it('commits create artifacts and safely rolls them back', async () => {
    const transaction = createProjectWriteTransaction({ backupRoot, randomActionId: () => 'action-1' });
    const result = await transaction.execute(preview([
      { path: 'CONTEXT.md', output: 'context\n' },
      { path: 'docs/agents/domain.md', output: 'domain\n' },
    ]));
    expect(result.state).toBe('committed');
    expect(await fs.readFile(path.join(projectRoot, 'CONTEXT.md'), 'utf8')).toBe('context\n');
    expect(await fs.readFile(path.join(projectRoot, 'docs/agents/domain.md'), 'utf8')).toBe('domain\n');

    const rolledBack = await transaction.rollback('project-1', result.id);
    expect(rolledBack.state).toBe('rolled-back');
    await expect(fs.access(path.join(projectRoot, 'CONTEXT.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(projectRoot, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('restores the complete pre-action tree when a middle publish fails', async () => {
    const transaction = createProjectWriteTransaction({
      backupRoot,
      randomActionId: () => 'action-2',
      afterPublish: (index) => {
        if (index === 0) throw Object.assign(new Error('publish failed'), { code: 'injected-publish-failure' });
      },
    });
    await expect(transaction.execute(preview([
      { path: 'CONTEXT.md', output: 'context\n' },
      { path: 'docs/agents/domain.md', output: 'domain\n' },
    ]))).rejects.toMatchObject({ code: 'injected-publish-failure' });
    await expect(fs.access(path.join(projectRoot, 'CONTEXT.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(projectRoot, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back an interrupted action on startup instead of forward completing it', async () => {
    const interrupted = createProjectWriteTransaction({
      backupRoot,
      randomActionId: () => 'action-3',
      afterPublish: () => {
        throw Object.assign(new Error('simulated crash'), { code: 'simulated-process-interruption' });
      },
    });
    await expect(interrupted.execute(preview([{ path: 'CONTEXT.md', output: 'context\n' }])))
      .rejects.toMatchObject({ code: 'simulated-process-interruption' });
    expect(await fs.readFile(path.join(projectRoot, 'CONTEXT.md'), 'utf8')).toBe('context\n');

    const restarted = createProjectWriteTransaction({ backupRoot });
    const recovered = await restarted.recoverPending();
    expect(recovered).toEqual([expect.objectContaining({ id: 'action-3', state: 'rolled-back' })]);
    await expect(fs.access(path.join(projectRoot, 'CONTEXT.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves an external writer result and marks recovery-required', async () => {
    const interrupted = createProjectWriteTransaction({
      backupRoot,
      randomActionId: () => 'action-4',
      afterPublish: () => {
        throw Object.assign(new Error('simulated crash'), { code: 'simulated-process-interruption' });
      },
    });
    await expect(interrupted.execute(preview([{ path: 'CONTEXT.md', output: 'context\n' }])))
      .rejects.toMatchObject({ code: 'simulated-process-interruption' });
    await fs.writeFile(path.join(projectRoot, 'CONTEXT.md'), 'external writer\n');

    const recovered = await createProjectWriteTransaction({ backupRoot }).recoverPending();
    expect(recovered).toEqual([expect.objectContaining({ id: 'action-4', state: 'recovery-required' })]);
    expect(await fs.readFile(path.join(projectRoot, 'CONTEXT.md'), 'utf8')).toBe('external writer\n');
  });

  it('blocks explicit rollback after an external writer changes a committed target', async () => {
    const transaction = createProjectWriteTransaction({ backupRoot, randomActionId: () => 'action-5' });
    const committed = await transaction.execute(preview([{ path: 'CONTEXT.md', output: 'context\n' }]));
    await fs.writeFile(path.join(projectRoot, 'CONTEXT.md'), 'external writer\n');

    const inspection = await transaction.inspectRollback('project-1', committed.id);
    expect(inspection.artifacts).toEqual([
      expect.objectContaining({ path: 'CONTEXT.md', state: 'conflict' }),
    ]);
    const result = await transaction.rollback('project-1', committed.id);
    expect(result.state).toBe('rollback-stale');
    expect(await fs.readFile(path.join(projectRoot, 'CONTEXT.md'), 'utf8')).toBe('external writer\n');
  });
});
