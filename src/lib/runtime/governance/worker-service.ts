import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanGovernanceSecretCandidates, type IGovernanceSecretCandidate } from '@/lib/governance/audit-service';
import { checkProjectDocuments } from '@/lib/governance/check-service';
import type {
  IApprovedProjectRootSnapshot,
  IManagedProject,
  IManagedProjectSnapshot,
  IProjectGovernanceSummary,
  IProjectLifecycleSnapshot,
  TKnowledgeIndexState,
} from '@/lib/governance/contracts';
import type { IGovernanceActionSummary } from '@/lib/governance/scaffold-contracts';
import { createScaffoldPreviewService } from '@/lib/governance/scaffold-preview';
import { createScaffoldTokenStore } from '@/lib/governance/scaffold-token';
import { createProjectWriteTransaction } from '@/lib/governance/project-write-transaction';
import { discoverProjectDocuments } from '@/lib/governance/document-discovery';
import { openKnowledgeIndex } from '@/lib/governance/knowledge-index';
import { assertNoNestedLinuxMount } from '@/lib/governance/project-path-policy';
import { deriveProjectLifecycleState } from '@/lib/project-lifecycle/state-derivation';
import {
  createRuntimeReply,
  parseRuntimeCommandPayload,
  type IRuntimeCommand,
  type IRuntimeReply,
} from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope, type IInvalidWorkerCommand } from '@/lib/runtime/worker-command-validation';

export interface IGovernanceWorkerServiceOptions {
  indexPath: string;
  backupRoot?: string;
  writesEnabled?: boolean;
  now?: () => Date;
  readMountInfo?: () => Promise<string>;
}

const MAX_DOCUMENT_BYTES = 256 * 1024;

const toPublicProject = (snapshot: IManagedProjectSnapshot): IManagedProject => {
  const { canonicalPath: _canonicalPath, ...project } = snapshot;
  return project;
};

const isContainedPath = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const createGovernanceWorkerService = (options: IGovernanceWorkerServiceOptions) => {
  const index = openKnowledgeIndex(options.indexPath);
  const snapshots = new Map<string, IManagedProjectSnapshot>();
  const roots = new Map<string, IApprovedProjectRootSnapshot>();
  const summaries = new Map<string, IProjectGovernanceSummary>();
  const lifecycles = new Map<string, IProjectLifecycleSnapshot>();
  const audits = new Map<string, IGovernanceSecretCandidate[]>();
  const now = options.now ?? (() => new Date());
  const writesEnabled = options.writesEnabled ?? false;
  const backupRoot = options.backupRoot ?? path.join(path.dirname(options.indexPath), 'governance-actions');
  const transaction = createProjectWriteTransaction({ backupRoot, now });
  const previewService = createScaffoldPreviewService({
    now: () => now().getTime(),
    ...(options.readMountInfo ? { readMountInfo: options.readMountInfo } : {}),
  });
  const rollbackTokens = createScaffoldTokenStore<{
    projectId: string;
    actionId: string;
    projectTitle: string;
    digest: string;
  }>({ now: () => now().getTime() });
  const activeWrites = new Set<string>();
  let indexState: TKnowledgeIndexState = 'ready';
  let writeState: 'disabled' | 'ready' | 'recovering' | 'degraded' = 'recovering';
  let lastIndexedAt: string | null = null;

  const initialization = (async () => {
    try {
      const recovered = await transaction.recoverPending();
      writeState = recovered.some((action) => action.state === 'recovery-required')
        ? 'degraded'
        : writesEnabled ? 'ready' : 'disabled';
    } catch {
      writeState = 'degraded';
    }
  })();

  const ok = <TPayload>(command: IRuntimeCommand, payload: TPayload): IRuntimeReply<TPayload> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'governance',
      target: command.source,
      type: `${command.type}.reply`,
      ok: true,
      payload,
    });

  const fail = (command: IRuntimeCommand, code: string, message: string, retryable = false): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'governance',
      target: command.source,
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error: { code, message, retryable },
    });

  const invalidCommand = (command: IRuntimeCommand, error: IInvalidWorkerCommand): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'governance',
      target: 'supervisor',
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error,
    });

  const refreshProjects = async (
    projects: IManagedProjectSnapshot[],
    approvedRoots: IApprovedProjectRootSnapshot[] = [],
  ) => {
    indexState = 'scanning';
    snapshots.clear();
    summaries.clear();
    lifecycles.clear();
    audits.clear();
    roots.clear();
    for (const root of approvedRoots) roots.set(root.id, root);
    let refreshed = 0;
    let failed = 0;

    for (const project of projects) {
      snapshots.set(project.id, project);
      try {
        const discovery = await discoverProjectDocuments({
          projectId: project.id,
          projectRoot: project.canonicalPath,
          wikiRoots: ['docs/wiki', 'wiki'],
        });
        index.replaceProjectDocuments(project.id, discovery.documents);
        const checks = checkProjectDocuments(project.id, discovery.documents);
        const lifecycle = deriveProjectLifecycleState(
          project.id,
          discovery.documents.map((document) => document.path),
        );
        const indexedAt = now().toISOString();
        const snapshot: IProjectLifecycleSnapshot = {
          ...lifecycle,
          lint: checks.lifecycle,
        };
        lifecycles.set(project.id, snapshot);
        audits.set(project.id, discovery.documents
          .flatMap((document) => scanGovernanceSecretCandidates(document.path, document.content))
          .slice(0, 2_000));
        summaries.set(project.id, {
          project: toPublicProject(project),
          engine: 'linux-single-host',
          readOnly: writeState !== 'ready',
          documentCount: discovery.documents.length,
          warningCount: checks.warningCount + discovery.warnings.length,
          lifecycleStage: lifecycle.stage,
          indexState: discovery.partial ? 'stale' : 'ready',
          indexedAt,
        });
        lastIndexedAt = indexedAt;
        refreshed += 1;
      } catch {
        failed += 1;
      }
    }
    indexState = failed > 0 ? 'degraded' : 'ready';
    return { refreshed, failed };
  };

  const requireSnapshot = (projectId: string): IManagedProjectSnapshot => {
    const snapshot = snapshots.get(projectId);
    if (!snapshot) {
      throw Object.assign(new Error(`Managed project not found: ${projectId}`), {
        code: 'managed-project-not-found',
      });
    }
    return snapshot;
  };

  const requireRoot = (project: IManagedProjectSnapshot): IApprovedProjectRootSnapshot => {
    const root = roots.get(project.approvedRootId);
    if (!root) {
      throw Object.assign(new Error(`Approved project root not found: ${project.approvedRootId}`), {
        code: 'approved-project-root-not-found',
      });
    }
    return root;
  };

  const requireWrites = (): void => {
    if (!writesEnabled) {
      throw Object.assign(new Error('Governance writes are disabled.'), {
        code: 'governance-writes-disabled',
      });
    }
    if (writeState !== 'ready') {
      throw Object.assign(new Error('Governance writes are not ready.'), {
        code: writeState === 'recovering' ? 'governance-writes-recovering' : 'governance-writes-degraded',
        retryable: writeState === 'recovering',
      });
    }
  };

  const withProjectWrite = async <TResult>(projectId: string, task: () => Promise<TResult>): Promise<TResult> => {
    if (activeWrites.has(projectId)) {
      throw Object.assign(new Error('A governance write is already active for this project.'), {
        code: 'governance-project-write-busy',
        retryable: true,
      });
    }
    activeWrites.add(projectId);
    try {
      return await task();
    } finally {
      activeWrites.delete(projectId);
    }
  };

  const refreshAfterWrite = async (action: IGovernanceActionSummary): Promise<IGovernanceActionSummary> => {
    const result = await refreshProjects([...snapshots.values()], [...roots.values()]);
    if (result.failed === 0) return action;
    return transaction.markIndexStale(action.projectId, action.id);
  };

  const readProjectDocument = async (projectId: string, documentPath: string) => {
    const snapshot = requireSnapshot(projectId);
    const indexed = index.listProjectDocuments(projectId).some((document) => document.path === documentPath);
    if (!indexed) {
      throw Object.assign(new Error(`Project document not indexed: ${documentPath}`), {
        code: 'project-document-not-found',
      });
    }
    const projectRoot = await fs.realpath(snapshot.canonicalPath);
    await assertNoNestedLinuxMount(
      projectRoot,
      options.readMountInfo ?? (() => fs.readFile('/proc/self/mountinfo', 'utf8')),
    );
    const requestedPath = path.resolve(projectRoot, documentPath);
    if (!isContainedPath(projectRoot, requestedPath)) {
      throw Object.assign(new Error('Project document path is outside the managed root.'), {
        code: 'project-document-path-forbidden',
      });
    }
    const targetStat = await fs.lstat(requestedPath);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw Object.assign(new Error('Project document is not a regular file.'), {
        code: 'project-document-not-regular',
      });
    }
    const canonicalTarget = await fs.realpath(requestedPath);
    if (!isContainedPath(projectRoot, canonicalTarget)) {
      throw Object.assign(new Error('Project document path is outside the managed root.'), {
        code: 'project-document-path-forbidden',
      });
    }
    const handle = await fs.open(canonicalTarget, 'r');
    try {
      const bytesToRead = Math.min(targetStat.size, MAX_DOCUMENT_BYTES);
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
      const markdown = buffer.subarray(0, bytesRead).toString('utf8');
      if (buffer.subarray(0, bytesRead).includes(0)) {
        throw Object.assign(new Error('Project document is binary.'), {
          code: 'project-document-binary',
        });
      }
      return {
        projectId,
        path: documentPath,
        markdown,
        truncated: targetStat.size > bytesRead,
        fingerprint: `sha256:${createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex')}`,
      };
    } finally {
      await handle.close();
    }
  };

  return {
    async handleCommand(command: IRuntimeCommand): Promise<IRuntimeReply> {
      await initialization;
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'governance', namespace: 'governance' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'governance.health') {
          parseRuntimeCommandPayload('governance.health', command.payload);
          return ok(command, { state: indexState, writeState, indexedProjects: summaries.size, lastIndexedAt });
        }
        if (command.type === 'governance.refresh-projects') {
          const input = parseRuntimeCommandPayload('governance.refresh-projects', command.payload);
          return ok(command, await refreshProjects(input.projects, input.roots));
        }
        if (command.type === 'governance.get-project-summary') {
          const input = parseRuntimeCommandPayload('governance.get-project-summary', command.payload);
          const summary = summaries.get(input.projectId);
          if (!summary) requireSnapshot(input.projectId);
          return ok(command, summary as IProjectGovernanceSummary);
        }
        if (command.type === 'governance.list-project-documents') {
          const input = parseRuntimeCommandPayload('governance.list-project-documents', command.payload);
          requireSnapshot(input.projectId);
          return ok(command, index.listProjectDocuments(input.projectId));
        }
        if (command.type === 'governance.get-project-lifecycle') {
          const input = parseRuntimeCommandPayload('governance.get-project-lifecycle', command.payload);
          const lifecycle = lifecycles.get(input.projectId);
          if (!lifecycle) requireSnapshot(input.projectId);
          return ok(command, lifecycle as IProjectLifecycleSnapshot);
        }
        if (command.type === 'governance.list-project-audit') {
          const input = parseRuntimeCommandPayload('governance.list-project-audit', command.payload);
          requireSnapshot(input.projectId);
          return ok(command, audits.get(input.projectId) ?? []);
        }
        if (command.type === 'governance.read-project-document') {
          const input = parseRuntimeCommandPayload('governance.read-project-document', command.payload);
          return ok(command, await readProjectDocument(input.projectId, input.path));
        }
        if (command.type === 'governance.preview-scaffold') {
          requireWrites();
          const input = parseRuntimeCommandPayload('governance.preview-scaffold', command.payload);
          const project = requireSnapshot(input.projectId);
          return ok(command, await previewService.createPreview({
            project,
            root: requireRoot(project),
            artifacts: input.artifacts,
            adoptArtifacts: input.adoptArtifacts,
            input: input.input,
          }));
        }
        if (command.type === 'governance.confirm-scaffold') {
          requireWrites();
          const input = parseRuntimeCommandPayload('governance.confirm-scaffold', command.payload);
          const project = requireSnapshot(input.projectId);
          return ok(command, await withProjectWrite(project.id, async () => {
            const confirmed = await previewService.confirmPreview({
              token: input.token,
              digest: input.digest,
              project,
              root: requireRoot(project),
              confirmation: input.confirmation,
            });
            return refreshAfterWrite(await transaction.execute(confirmed));
          }));
        }
        if (command.type === 'governance.list-actions') {
          const input = parseRuntimeCommandPayload('governance.list-actions', command.payload);
          requireSnapshot(input.projectId);
          return ok(command, await transaction.listActions(input.projectId));
        }
        if (command.type === 'governance.preview-action-rollback') {
          requireWrites();
          const input = parseRuntimeCommandPayload('governance.preview-action-rollback', command.payload);
          const project = requireSnapshot(input.projectId);
          const rollback = await transaction.inspectRollback(input.projectId, input.actionId);
          if (rollback.projectTitle !== project.title) {
            throw Object.assign(new Error('Managed project title changed after the action.'), {
              code: 'governance-action-project-changed',
            });
          }
          const stored = rollbackTokens.create({
            projectId: input.projectId,
            actionId: input.actionId,
            projectTitle: rollback.projectTitle,
            digest: rollback.digest,
          });
          return ok(command, {
            token: stored.token,
            expiresAt: stored.expiresAt,
            digest: rollback.digest,
            projectId: input.projectId,
            projectTitle: rollback.projectTitle,
            action: rollback.action,
            artifacts: rollback.artifacts,
          });
        }
        if (command.type === 'governance.confirm-action-rollback') {
          requireWrites();
          const input = parseRuntimeCommandPayload('governance.confirm-action-rollback', command.payload);
          const project = requireSnapshot(input.projectId);
          return ok(command, await withProjectWrite(project.id, async () => {
            const stored = rollbackTokens.get(input.token);
            if (
              stored.projectId !== input.projectId
              || stored.actionId !== input.actionId
              || stored.digest !== input.digest
              || stored.projectTitle !== input.confirmation
              || project.title !== input.confirmation
            ) {
              throw Object.assign(new Error('Rollback preview binding changed.'), { code: 'stale-preview' });
            }
            const current = await transaction.inspectRollback(input.projectId, input.actionId);
            if (current.digest !== stored.digest) {
              throw Object.assign(new Error('Rollback targets changed after preview.'), { code: 'stale-preview' });
            }
            rollbackTokens.consume(input.token);
            return refreshAfterWrite(await transaction.rollback(input.projectId, input.actionId));
          }));
        }
        return invalidCommand(command, {
          code: 'invalid-worker-command',
          message: `Unsupported governance command: ${command.type}`,
          retryable: false,
        });
      } catch (error) {
        const structured = error as { code?: string; retryable?: boolean } | null;
        return fail(
          command,
          structured?.code ?? 'command-failed',
          error instanceof Error ? error.message : String(error),
          structured?.retryable ?? false,
        );
      }
    },

    close(): void {
      index.close();
    },

    initialize(): Promise<void> {
      return initialization;
    },
  };
};
