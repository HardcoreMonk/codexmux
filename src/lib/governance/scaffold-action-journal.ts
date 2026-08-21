import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { projectIdSchema, relativeDocumentPathSchema } from '@/lib/governance/contracts';
import type {
  IGovernanceActionSummary,
  TGovernanceActionState,
  TScaffoldArtifactId,
} from '@/lib/governance/scaffold-contracts';
import { scaffoldArtifactIdSchema } from '@/lib/governance/scaffold-contracts';

export interface IScaffoldActionManifestArtifact {
  id: TScaffoldArtifactId;
  path: string;
  absolutePath: string;
  state: 'create' | 'marker-update';
  templateId: string;
  fromVersion: number | null;
  toVersion: number;
  baseFingerprint: string;
  outputFingerprint: string;
  preimagePath: string | null;
  stagePath: string;
  targetMode: number;
  published: boolean;
}

export interface IScaffoldActionManifest {
  version: 1;
  id: string;
  projectId: string;
  projectTitle: string;
  canonicalProjectPath: string;
  state: TGovernanceActionState;
  artifacts: IScaffoldActionManifestArtifact[];
  createdDirectories: string[];
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  indexState: 'ready' | 'stale';
}

interface ICreateScaffoldActionJournalOptions {
  backupRoot: string;
}

const syncDirectory = async (directory: string): Promise<void> => {
  const handle = await fs.open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const assertPathSegment = (value: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw Object.assign(new Error('Governance action identifier is invalid.'), {
      code: 'governance-action-id-invalid',
    });
  }
};

const absolutePathSchema = z.string().min(1).max(4096).refine((value) => path.isAbsolute(value));
const fingerprintSchema = z.string().regex(/^(?:absent|sha256:[a-f0-9]{64})$/);
const actionManifestSchema: z.ZodType<IScaffoldActionManifest> = z.object({
  version: z.literal(1),
  id: projectIdSchema,
  projectId: projectIdSchema,
  projectTitle: z.string().trim().min(1).max(160),
  canonicalProjectPath: absolutePathSchema,
  state: z.enum([
    'preparing', 'publishing', 'committed', 'index-stale', 'rolling-back', 'rolled-back',
    'recovery-required', 'rollback-stale',
  ]),
  artifacts: z.array(z.object({
    id: scaffoldArtifactIdSchema,
    path: relativeDocumentPathSchema,
    absolutePath: absolutePathSchema,
    state: z.enum(['create', 'marker-update']),
    templateId: projectIdSchema,
    fromVersion: z.number().int().positive().nullable(),
    toVersion: z.number().int().positive(),
    baseFingerprint: fingerprintSchema,
    outputFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    preimagePath: absolutePathSchema.nullable(),
    stagePath: absolutePathSchema,
    targetMode: z.number().int().min(0).max(0o777),
    published: z.boolean(),
  }).strict()).max(6),
  createdDirectories: z.array(absolutePathSchema).max(32),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  errorCode: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).nullable(),
  indexState: z.enum(['ready', 'stale']),
}).strict();

export const toGovernanceActionSummary = (
  manifest: IScaffoldActionManifest,
): IGovernanceActionSummary => ({
  id: manifest.id,
  projectId: manifest.projectId,
  state: manifest.state,
  artifactCount: manifest.artifacts.length,
  createdAt: manifest.createdAt,
  updatedAt: manifest.updatedAt,
  errorCode: manifest.errorCode,
  indexState: manifest.indexState,
});

export const createScaffoldActionJournal = ({ backupRoot }: ICreateScaffoldActionJournalOptions) => {
  const actionDir = (projectId: string, actionId: string): string => {
    assertPathSegment(projectId);
    assertPathSegment(actionId);
    return path.join(backupRoot, projectId, actionId);
  };

  const manifestPath = (projectId: string, actionId: string): string =>
    path.join(actionDir(projectId, actionId), 'action.json');

  const parseManifest = (
    value: unknown,
    expectedProjectId?: string,
    expectedActionId?: string,
  ): IScaffoldActionManifest => {
    const manifest = actionManifestSchema.parse(value);
    if (
      (expectedProjectId && manifest.projectId !== expectedProjectId)
      || (expectedActionId && manifest.id !== expectedActionId)
    ) {
      throw Object.assign(new Error('Governance action manifest identity does not match its directory.'), {
        code: 'governance-action-manifest-invalid',
      });
    }
    const directory = actionDir(manifest.projectId, manifest.id);
    for (const artifact of manifest.artifacts) {
      if (artifact.absolutePath !== path.join(manifest.canonicalProjectPath, ...artifact.path.split('/'))) {
        throw Object.assign(new Error('Governance action target is outside its project.'), {
          code: 'governance-action-manifest-invalid',
        });
      }
      if (
        artifact.stagePath !== path.join(
          path.dirname(artifact.absolutePath),
          `.codexmux-stage-${manifest.id}-${artifact.id}`,
        )
        || artifact.preimagePath !== null
          && artifact.preimagePath !== path.join(directory, 'preimage', `${artifact.id}.md`)
        || artifact.state === 'create' && artifact.preimagePath !== null
        || artifact.state === 'marker-update' && artifact.preimagePath === null
      ) {
        throw Object.assign(new Error('Governance action recovery path is invalid.'), {
          code: 'governance-action-manifest-invalid',
        });
      }
    }
    if (manifest.createdDirectories.some((candidate) => {
      const relative = path.relative(manifest.canonicalProjectPath, candidate);
      return !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    })) {
      throw Object.assign(new Error('Governance action directory is outside its project.'), {
        code: 'governance-action-manifest-invalid',
      });
    }
    return manifest;
  };

  return {
    actionDir,
    manifestPath,

    async write(manifest: IScaffoldActionManifest): Promise<void> {
      const validated = parseManifest(manifest);
      const directory = actionDir(validated.projectId, validated.id);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.chmod(directory, 0o700);
      const target = manifestPath(validated.projectId, validated.id);
      const temporary = path.join(directory, `.action-${process.pid}-${Date.now()}.tmp`);
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await fs.rename(temporary, target);
        await fs.chmod(target, 0o600);
        await syncDirectory(directory);
      } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
      }
    },

    async read(projectId: string, actionId: string): Promise<IScaffoldActionManifest> {
      return parseManifest(
        JSON.parse(await fs.readFile(manifestPath(projectId, actionId), 'utf8')),
        projectId,
        actionId,
      );
    },

    async list(): Promise<IScaffoldActionManifest[]> {
      const projectEntries = await fs.readdir(backupRoot, { withFileTypes: true }).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      });
      const manifests: IScaffoldActionManifest[] = [];
      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) continue;
        const projectDirectory = path.join(backupRoot, projectEntry.name);
        const actionEntries = await fs.readdir(projectDirectory, { withFileTypes: true });
        for (const actionEntry of actionEntries) {
          if (!actionEntry.isDirectory()) continue;
          const candidate = path.join(projectDirectory, actionEntry.name, 'action.json');
          try {
            manifests.push(parseManifest(
              JSON.parse(await fs.readFile(candidate, 'utf8')),
              projectEntry.name,
              actionEntry.name,
            ));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      }
      return manifests.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
  };
};
