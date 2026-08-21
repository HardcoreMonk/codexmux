import fs from 'node:fs/promises';
import path from 'node:path';
import type { TScaffoldArtifactId } from '@/lib/governance/scaffold-contracts';

interface IScaffoldBackupInputArtifact {
  id: TScaffoldArtifactId;
  absolutePath: string;
  baseFingerprint: string;
  state: 'create' | 'marker-update';
}

interface IScaffoldBackupArtifact extends IScaffoldBackupInputArtifact {
  preimagePath: string | null;
  targetMode: number;
}

interface ICreateScaffoldBackupInput {
  backupRoot: string;
  projectId: string;
  actionId: string;
  artifacts: IScaffoldBackupInputArtifact[];
}

const writePrivateFile = async (target: string, bytes: Buffer): Promise<void> => {
  const handle = await fs.open(target, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const createScaffoldBackup = async ({
  backupRoot,
  projectId,
  actionId,
  artifacts,
}: ICreateScaffoldBackupInput): Promise<{
  actionDir: string;
  artifacts: IScaffoldBackupArtifact[];
}> => {
  const actionDir = path.join(backupRoot, projectId, actionId);
  const preimageDirectory = path.join(actionDir, 'preimage');
  await fs.mkdir(preimageDirectory, { recursive: true, mode: 0o700 });
  await Promise.all([fs.chmod(actionDir, 0o700), fs.chmod(preimageDirectory, 0o700)]);

  const backedUp: IScaffoldBackupArtifact[] = [];
  for (const artifact of artifacts) {
    if (artifact.state === 'create') {
      backedUp.push({ ...artifact, preimagePath: null, targetMode: 0o644 });
      continue;
    }
    const stat = await fs.lstat(artifact.absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw Object.assign(new Error('Governance artifact is not a regular file.'), {
        code: 'governance-artifact-not-regular',
      });
    }
    const preimagePath = path.join(preimageDirectory, `${artifact.id}.md`);
    await writePrivateFile(preimagePath, await fs.readFile(artifact.absolutePath));
    backedUp.push({
      ...artifact,
      preimagePath,
      targetMode: stat.mode & 0o777,
    });
  }
  return { actionDir, artifacts: backedUp };
};
