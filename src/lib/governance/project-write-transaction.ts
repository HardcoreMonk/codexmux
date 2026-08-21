import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  IGovernanceActionSummary,
  IGovernanceRollbackArtifactPreview,
} from '@/lib/governance/scaffold-contracts';
import type { IConfirmedScaffoldPreview } from '@/lib/governance/scaffold-preview';
import {
  createScaffoldActionJournal,
  toGovernanceActionSummary,
  type IScaffoldActionManifest,
  type IScaffoldActionManifestArtifact,
} from '@/lib/governance/scaffold-action-journal';
import { createScaffoldBackup } from '@/lib/governance/scaffold-backup';
import { relativeDocumentPathSchema } from '@/lib/governance/contracts';

interface ICreateProjectWriteTransactionOptions {
  backupRoot: string;
  randomActionId?: () => string;
  now?: () => Date;
  afterPublish?: (index: number) => void | Promise<void>;
}

const fingerprint = (value: Buffer | string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const errorCode = (error: unknown): string => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && /^[a-z][a-z0-9-]{0,79}$/i.test(code)
    ? code.toLowerCase()
    : 'governance-write-failed';
};

const currentFingerprint = async (candidate: string): Promise<string> => {
  try {
    const stat = await fs.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return 'unsafe';
    return fingerprint(await fs.readFile(candidate));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
};

const syncDirectory = async (directory: string): Promise<void> => {
  const handle = await fs.open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const writeStage = async (artifact: IScaffoldActionManifestArtifact, output: string): Promise<void> => {
  const handle = await fs.open(artifact.stagePath, 'wx', artifact.targetMode);
  try {
    await handle.writeFile(output, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const createProjectWriteTransaction = ({
  backupRoot,
  randomActionId = () => `action-${randomUUID()}`,
  now = () => new Date(),
  afterPublish,
}: ICreateProjectWriteTransactionOptions) => {
  const journal = createScaffoldActionJournal({ backupRoot });

  const updateManifest = async (
    manifest: IScaffoldActionManifest,
    changes: Partial<IScaffoldActionManifest>,
  ): Promise<IScaffoldActionManifest> => {
    const next = { ...manifest, ...changes, updatedAt: now().toISOString() };
    await journal.write(next);
    return next;
  };

  const inspectManifestRollback = async (manifest: IScaffoldActionManifest): Promise<{
    artifacts: IGovernanceRollbackArtifactPreview[];
    digest: string;
    conflict: boolean;
  }> => {
    const artifacts: IGovernanceRollbackArtifactPreview[] = [];
    const fingerprints: Array<{ id: string; fingerprint: string }> = [];
    for (const artifact of manifest.artifacts) {
      const current = await currentFingerprint(artifact.absolutePath);
      fingerprints.push({ id: artifact.id, fingerprint: current });
      if (artifact.state === 'create') {
        const valid = current === artifact.outputFingerprint || current === 'absent';
        artifacts.push({
          id: artifact.id,
          path: artifact.path,
          state: valid ? (current === 'absent' ? 'already-restored' : 'delete') : 'conflict',
          errorCode: valid ? null : 'external-writer-conflict',
        });
        continue;
      }
      const valid = current === artifact.outputFingerprint || current === artifact.baseFingerprint;
      artifacts.push({
        id: artifact.id,
        path: artifact.path,
        state: valid ? (current === artifact.baseFingerprint ? 'already-restored' : 'restore') : 'conflict',
        errorCode: valid ? null : 'external-writer-conflict',
      });
    }
    return {
      artifacts,
      digest: fingerprint(JSON.stringify({
        actionId: manifest.id,
        updatedAt: manifest.updatedAt,
        fingerprints,
      })),
      conflict: artifacts.some((artifact) => artifact.state === 'conflict'),
    };
  };

  const rollbackManifest = async (
    initial: IScaffoldActionManifest,
    staleState: 'recovery-required' | 'rollback-stale' = 'recovery-required',
  ): Promise<IScaffoldActionManifest> => {
    const inspection = await inspectManifestRollback(initial);
    if (inspection.conflict) {
      return updateManifest(initial, {
        state: staleState,
        errorCode: staleState === 'rollback-stale' ? 'rollback-stale' : 'external-writer-conflict',
      });
    }
    let manifest = await updateManifest(initial, { state: 'rolling-back', errorCode: initial.errorCode });
    for (const artifact of [...manifest.artifacts].reverse()) {
      const current = await currentFingerprint(artifact.absolutePath);
      if (artifact.state === 'create') {
        if (current === artifact.outputFingerprint) {
          await fs.unlink(artifact.absolutePath);
          await syncDirectory(path.dirname(artifact.absolutePath));
        }
      } else if (current === artifact.outputFingerprint) {
        if (!artifact.preimagePath) {
          throw Object.assign(new Error('Governance action preimage is missing.'), {
            code: 'governance-preimage-missing',
          });
        } else {
          const temporary = path.join(
            path.dirname(artifact.absolutePath),
            `.codexmux-restore-${manifest.id}-${artifact.id}`,
          );
          await fs.rm(temporary, { force: true });
          const handle = await fs.open(temporary, 'wx', artifact.targetMode);
          try {
            await handle.writeFile(await fs.readFile(artifact.preimagePath));
            await handle.sync();
          } finally {
            await handle.close();
          }
          await fs.rename(temporary, artifact.absolutePath);
          await syncDirectory(path.dirname(artifact.absolutePath));
        }
      }
      await fs.rm(artifact.stagePath, { force: true });
    }
    for (const directory of [...manifest.createdDirectories].sort((left, right) => right.length - left.length)) {
      try {
        await fs.rmdir(directory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
      }
    }
    manifest = await updateManifest(manifest, {
      state: 'rolled-back',
      errorCode: manifest.errorCode,
    });
    return manifest;
  };

  const ensureParentDirectories = async (
    manifest: IScaffoldActionManifest,
    target: string,
  ): Promise<IScaffoldActionManifest> => {
    const parent = path.dirname(target);
    const relative = path.relative(manifest.canonicalProjectPath, parent);
    let cursor = manifest.canonicalProjectPath;
    let current = manifest;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      try {
        await fs.mkdir(cursor, { mode: 0o755 });
        current = await updateManifest(current, {
          createdDirectories: [...current.createdDirectories, cursor],
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const stat = await fs.lstat(cursor);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw Object.assign(new Error('Governance artifact ancestor is unsafe.'), {
            code: 'governance-artifact-ancestor-not-directory',
          });
        }
      }
    }
    return current;
  };

  return {
    async execute(preview: IConfirmedScaffoldPreview): Promise<IGovernanceActionSummary> {
      if (!path.isAbsolute(preview.canonicalProjectPath)) {
        throw Object.assign(new Error('Governance project path is invalid.'), {
          code: 'governance-action-manifest-invalid',
        });
      }
      for (const artifact of preview.artifacts) {
        const expectedPath = path.join(preview.canonicalProjectPath, ...artifact.path.split('/'));
        if (
          !relativeDocumentPathSchema.safeParse(artifact.path).success
          || artifact.absolutePath !== expectedPath
          || fingerprint(artifact.output) !== artifact.outputFingerprint
        ) {
          throw Object.assign(new Error('Governance artifact binding is invalid.'), {
            code: 'governance-action-manifest-invalid',
          });
        }
      }
      const actionId = randomActionId();
      const timestamp = now().toISOString();
      const backup = await createScaffoldBackup({
        backupRoot,
        projectId: preview.projectId,
        actionId,
        artifacts: preview.artifacts.map(({ id, absolutePath, baseFingerprint, state }) => ({
          id,
          absolutePath,
          baseFingerprint,
          state,
        })),
      });
      let manifest: IScaffoldActionManifest = {
        version: 1,
        id: actionId,
        projectId: preview.projectId,
        projectTitle: preview.projectTitle,
        canonicalProjectPath: preview.canonicalProjectPath,
        state: 'preparing',
        artifacts: preview.artifacts.map((artifact, index) => ({
          id: artifact.id,
          path: artifact.path,
          absolutePath: artifact.absolutePath,
          state: artifact.state,
          templateId: artifact.templateId,
          fromVersion: artifact.fromVersion,
          toVersion: artifact.toVersion,
          baseFingerprint: artifact.baseFingerprint,
          outputFingerprint: artifact.outputFingerprint,
          preimagePath: backup.artifacts[index]?.preimagePath ?? null,
          stagePath: path.join(
            path.dirname(artifact.absolutePath),
            `.codexmux-stage-${actionId}-${artifact.id}`,
          ),
          targetMode: backup.artifacts[index]?.targetMode ?? 0o644,
          published: false,
        })),
        createdDirectories: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        errorCode: null,
        indexState: 'ready',
      };
      await journal.write(manifest);
      try {
        for (const artifact of manifest.artifacts) {
          manifest = await ensureParentDirectories(manifest, artifact.absolutePath);
        }
        for (let index = 0; index < manifest.artifacts.length; index += 1) {
          await writeStage(manifest.artifacts[index]!, preview.artifacts[index]!.output);
        }
        manifest = await updateManifest(manifest, { state: 'publishing' });
        for (let index = 0; index < manifest.artifacts.length; index += 1) {
          const artifact = manifest.artifacts[index]!;
          if (await currentFingerprint(artifact.absolutePath) !== artifact.baseFingerprint) {
            throw Object.assign(new Error('Governance artifact changed after preview.'), {
              code: 'stale-preview',
            });
          }
          if (artifact.state === 'create') {
            await fs.link(artifact.stagePath, artifact.absolutePath);
            await fs.unlink(artifact.stagePath);
          } else {
            await fs.rename(artifact.stagePath, artifact.absolutePath);
          }
          await syncDirectory(path.dirname(artifact.absolutePath));
          manifest = await updateManifest(manifest, {
            artifacts: manifest.artifacts.map((candidate, candidateIndex) =>
              candidateIndex === index ? { ...candidate, published: true } : candidate),
          });
          await afterPublish?.(index);
        }
        manifest = await updateManifest(manifest, { state: 'committed' });
        return toGovernanceActionSummary(manifest);
      } catch (error) {
        if (errorCode(error) === 'simulated-process-interruption') throw error;
        manifest = await updateManifest(manifest, { errorCode: errorCode(error) });
        await rollbackManifest(manifest);
        throw error;
      }
    },

    async rollback(projectId: string, actionId: string): Promise<IGovernanceActionSummary> {
      const manifest = await journal.read(projectId, actionId);
      if (!['committed', 'index-stale', 'rollback-stale'].includes(manifest.state)) {
        throw Object.assign(new Error('Governance action cannot be rolled back from its current state.'), {
          code: 'governance-action-not-rollbackable',
        });
      }
      return toGovernanceActionSummary(await rollbackManifest(manifest, 'rollback-stale'));
    },

    async inspectRollback(projectId: string, actionId: string): Promise<{
      projectTitle: string;
      action: IGovernanceActionSummary;
      artifacts: IGovernanceRollbackArtifactPreview[];
      digest: string;
    }> {
      const manifest = await journal.read(projectId, actionId);
      if (!['committed', 'index-stale', 'rollback-stale'].includes(manifest.state)) {
        throw Object.assign(new Error('Governance action cannot be rolled back from its current state.'), {
          code: 'governance-action-not-rollbackable',
        });
      }
      const inspection = await inspectManifestRollback(manifest);
      return {
        projectTitle: manifest.projectTitle,
        action: toGovernanceActionSummary(manifest),
        artifacts: inspection.artifacts,
        digest: inspection.digest,
      };
    },

    async listActions(projectId: string): Promise<IGovernanceActionSummary[]> {
      return (await journal.list())
        .filter((manifest) => manifest.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 500)
        .map(toGovernanceActionSummary);
    },

    async markIndexStale(projectId: string, actionId: string): Promise<IGovernanceActionSummary> {
      const manifest = await journal.read(projectId, actionId);
      const next = await updateManifest(manifest, {
        state: manifest.state === 'committed' ? 'index-stale' : manifest.state,
        indexState: 'stale',
        errorCode: 'index-refresh-failed',
      });
      return toGovernanceActionSummary(next);
    },

    async recoverPending(): Promise<IGovernanceActionSummary[]> {
      const pending = (await journal.list()).filter((manifest) =>
        ['preparing', 'publishing', 'rolling-back'].includes(manifest.state));
      const recovered: IGovernanceActionSummary[] = [];
      for (const manifest of pending) {
        recovered.push(toGovernanceActionSummary(await rollbackManifest(manifest)));
      }
      return recovered;
    },
  };
};
