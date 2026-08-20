import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanGovernanceSecretCandidates, type IGovernanceSecretCandidate } from '@/lib/governance/audit-service';
import { checkProjectDocuments } from '@/lib/governance/check-service';
import type {
  IManagedProject,
  IManagedProjectSnapshot,
  IProjectGovernanceSummary,
  IProjectLifecycleSnapshot,
  TKnowledgeIndexState,
} from '@/lib/governance/contracts';
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
  const summaries = new Map<string, IProjectGovernanceSummary>();
  const lifecycles = new Map<string, IProjectLifecycleSnapshot>();
  const audits = new Map<string, IGovernanceSecretCandidate[]>();
  const now = options.now ?? (() => new Date());
  let indexState: TKnowledgeIndexState = 'ready';
  let lastIndexedAt: string | null = null;

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

  const refreshProjects = async (projects: IManagedProjectSnapshot[]) => {
    indexState = 'scanning';
    snapshots.clear();
    summaries.clear();
    lifecycles.clear();
    audits.clear();
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
          readOnly: true,
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
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'governance', namespace: 'governance' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'governance.health') {
          parseRuntimeCommandPayload('governance.health', command.payload);
          return ok(command, { state: indexState, indexedProjects: summaries.size, lastIndexedAt });
        }
        if (command.type === 'governance.refresh-projects') {
          const input = parseRuntimeCommandPayload('governance.refresh-projects', command.payload);
          return ok(command, await refreshProjects(input.projects));
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
  };
};
