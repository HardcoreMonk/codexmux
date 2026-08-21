import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createTwoFilesPatch } from 'diff';
import type { IApprovedProjectRootSnapshot, IManagedProjectSnapshot } from '@/lib/governance/contracts';
import { resolveGovernanceArtifactTarget } from '@/lib/governance/project-path-policy';
import type {
  IScaffoldArtifactPreview,
  IScaffoldPreview,
  TScaffoldArtifactId,
  TScaffoldTemplateInput,
} from '@/lib/governance/scaffold-contracts';
import {
  listScaffoldTemplates,
  renderScaffoldTemplate,
  renderScaffoldTemplateContent,
} from '@/lib/governance/scaffold-template-catalog';
import { planMarkerOwnedUpdate } from '@/lib/governance/scaffold-marker';
import { createScaffoldTokenStore } from '@/lib/governance/scaffold-token';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_ACTION_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 256 * 1024;

export interface IConfirmedScaffoldArtifact {
  id: TScaffoldArtifactId;
  path: string;
  absolutePath: string;
  templateId: string;
  fromVersion: number | null;
  toVersion: number;
  state: 'create' | 'marker-update';
  output: string;
  baseFingerprint: string;
  outputFingerprint: string;
  missingDirectories: string[];
}

export interface IConfirmedScaffoldPreview {
  projectId: string;
  projectTitle: string;
  canonicalProjectPath: string;
  digest: string;
  artifacts: IConfirmedScaffoldArtifact[];
}

interface IInternalPreview extends IConfirmedScaffoldPreview {
  input: TScaffoldTemplateInput;
  selectedArtifacts: TScaffoldArtifactId[];
  publicArtifacts: IScaffoldArtifactPreview[];
  totalBytes: number;
}

interface ICreateScaffoldPreviewServiceOptions {
  now?: () => number;
  randomToken?: () => string;
  ttlMs?: number;
  readMountInfo?: () => Promise<string>;
}

const scaffoldError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, retryable: false });

const fingerprint = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const boundedDiff = (relativePath: string, before: string, after: string): string => {
  const value = createTwoFilesPatch(relativePath, relativePath, before, after, 'before', 'after', { context: 3 });
  if (Buffer.byteLength(value) <= MAX_DIFF_BYTES) return value;
  return `${Buffer.from(value).subarray(0, MAX_DIFF_BYTES).toString('utf8')}\n... diff truncated ...\n`;
};

const assertProjectBinding = (
  project: IManagedProjectSnapshot,
  root: IApprovedProjectRootSnapshot,
): void => {
  if (project.approvedRootId !== root.id) {
    throw scaffoldError('approved-project-root-required', 'Managed Project is not bound to this Approved Project Root.');
  }
};

export const createScaffoldPreviewService = (options: ICreateScaffoldPreviewServiceOptions = {}) => {
  const store = createScaffoldTokenStore<IInternalPreview>(options);
  const readMountInfo = options.readMountInfo;

  const buildPreview = async ({
    project,
    root,
    artifacts,
    input,
  }: {
    project: IManagedProjectSnapshot;
    root: IApprovedProjectRootSnapshot;
    artifacts: TScaffoldArtifactId[];
    input: TScaffoldTemplateInput;
  }): Promise<IInternalPreview> => {
    assertProjectBinding(project, root);
    const selected = new Set(artifacts);
    if (selected.has('design') && !input.uiProject) {
      throw scaffoldError('scaffold-design-requires-ui-project', 'DESIGN.md requires an explicitly declared UI project.');
    }
    const publicArtifacts: IScaffoldArtifactPreview[] = [];
    const confirmedArtifacts: IConfirmedScaffoldArtifact[] = [];
    for (const definition of listScaffoldTemplates()) {
      if (!selected.has(definition.id)) {
        publicArtifacts.push({
          id: definition.id, path: definition.path, templateId: definition.templateId,
          fromVersion: null, toVersion: definition.version, state: 'skipped', diff: '', bytes: 0, errorCode: null,
        });
        continue;
      }
      const target = await resolveGovernanceArtifactTarget({
        approvedRootPath: root.canonicalPath,
        projectPath: project.canonicalPath,
        relativePath: definition.path,
      }, { ...(readMountInfo ? { readMountInfo } : {}) });
      const templateContent = renderScaffoldTemplateContent(definition.id, input);
      let before = '';
      let output = renderScaffoldTemplate(definition.id, input);
      let baseFingerprint = 'absent';
      let state: IScaffoldArtifactPreview['state'] = 'create';
      let fromVersion: number | null = null;
      let errorCode: string | null = null;
      if (target.exists) {
        const bytes = await fs.readFile(target.targetPath);
        if (bytes.length > MAX_FILE_BYTES) {
          state = 'conflict';
          errorCode = 'scaffold-file-too-large';
          output = '';
        } else if (bytes.includes(0)) {
          state = 'conflict';
          errorCode = 'governance-artifact-not-text';
          output = '';
        } else {
          before = bytes.toString('utf8');
          baseFingerprint = fingerprint(before);
          const marker = planMarkerOwnedUpdate({
            existing: before,
            templateId: definition.templateId,
            targetVersion: definition.version,
            supportedVersions: [definition.version],
            content: templateContent,
          });
          state = marker.state;
          output = marker.output ?? '';
          fromVersion = marker.fromVersion;
          errorCode = marker.errorCode;
        }
      }
      const outputBytes = Buffer.byteLength(output);
      if (outputBytes > MAX_FILE_BYTES) {
        throw scaffoldError('scaffold-file-too-large', `Scaffold artifact exceeds ${MAX_FILE_BYTES} bytes.`);
      }
      const diff = state === 'create' || state === 'marker-update' ? boundedDiff(definition.path, before, output) : '';
      publicArtifacts.push({
        id: definition.id,
        path: definition.path,
        templateId: definition.templateId,
        fromVersion,
        toVersion: definition.version,
        state,
        diff,
        bytes: outputBytes,
        errorCode,
      });
      if (state === 'create' || state === 'marker-update') {
        confirmedArtifacts.push({
          id: definition.id,
          path: definition.path,
          absolutePath: target.targetPath,
          templateId: definition.templateId,
          fromVersion,
          toVersion: definition.version,
          state,
          output,
          baseFingerprint,
          outputFingerprint: fingerprint(output),
          missingDirectories: target.missingDirectories,
        });
      }
    }
    const totalBytes = confirmedArtifacts.reduce((total, artifact) => total + Buffer.byteLength(artifact.output), 0);
    if (totalBytes > MAX_ACTION_BYTES) {
      throw scaffoldError('scaffold-action-too-large', `Scaffold action exceeds ${MAX_ACTION_BYTES} bytes.`);
    }
    const digest = fingerprint(JSON.stringify({
      projectId: project.id,
      projectTitle: project.title,
      input,
      selectedArtifacts: artifacts,
      artifacts: publicArtifacts.map(({ diff: _diff, ...artifact }) => ({
        ...artifact,
        baseFingerprint: confirmedArtifacts.find((candidate) => candidate.id === artifact.id)?.baseFingerprint ?? null,
        outputFingerprint: confirmedArtifacts.find((candidate) => candidate.id === artifact.id)?.outputFingerprint ?? null,
      })),
    }));
    return {
      projectId: project.id,
      projectTitle: project.title,
      canonicalProjectPath: project.canonicalPath,
      digest,
      input,
      selectedArtifacts: [...artifacts],
      artifacts: confirmedArtifacts,
      publicArtifacts,
      totalBytes,
    };
  };

  return {
    async createPreview(input: {
      project: IManagedProjectSnapshot;
      root: IApprovedProjectRootSnapshot;
      artifacts: TScaffoldArtifactId[];
      input: TScaffoldTemplateInput;
    }): Promise<IScaffoldPreview> {
      const built = await buildPreview(input);
      const token = store.create(built);
      return {
        token: token.token,
        expiresAt: token.expiresAt,
        digest: built.digest,
        projectId: built.projectId,
        projectTitle: built.projectTitle,
        artifacts: built.publicArtifacts,
        totalBytes: built.totalBytes,
      };
    },

    async confirmPreview({
      token,
      digest,
      project,
      root,
      confirmation,
    }: {
      token: string;
      digest: string;
      project: IManagedProjectSnapshot;
      root: IApprovedProjectRootSnapshot;
      confirmation: string;
    }): Promise<IConfirmedScaffoldPreview> {
      const stored = store.get(token);
      if (confirmation !== stored.projectTitle || confirmation !== project.title) {
        throw scaffoldError('confirmation-mismatch', 'Project title confirmation did not match.');
      }
      if (digest !== stored.digest || project.id !== stored.projectId || root.id !== project.approvedRootId) {
        throw scaffoldError('stale-preview', 'Scaffold preview changed.');
      }
      const current = await buildPreview({
        project,
        root,
        artifacts: stored.selectedArtifacts,
        input: stored.input,
      });
      if (current.digest !== stored.digest) {
        throw scaffoldError('stale-preview', 'Scaffold targets changed after preview.');
      }
      if (current.publicArtifacts.some((artifact) => artifact.state === 'conflict')) {
        throw scaffoldError('scaffold-preview-conflict', 'Scaffold preview contains conflicts.');
      }
      if (current.artifacts.length === 0) {
        throw scaffoldError('scaffold-no-changes', 'Scaffold preview does not contain any changes.');
      }
      store.consume(token);
      return {
        projectId: current.projectId,
        projectTitle: current.projectTitle,
        canonicalProjectPath: current.canonicalProjectPath,
        digest: current.digest,
        artifacts: current.artifacts,
      };
    },
  };
};
