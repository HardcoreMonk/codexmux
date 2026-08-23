import {
  createRuntimeReply,
  parseRuntimeCommandPayload,
  type IRuntimeCommand,
  type IRuntimeReply,
} from '@/lib/runtime/ipc';
import { createStorageRepository } from '@/lib/runtime/storage/repository';
import { openRuntimeDatabase } from '@/lib/runtime/storage/schema';
import { validateWorkerCommandEnvelope, type IInvalidWorkerCommand } from '@/lib/runtime/worker-command-validation';

export interface IStorageWorkerServiceOptions {
  dbPath: string;
}

export const createStorageWorkerService = (options: IStorageWorkerServiceOptions) => {
  const db = openRuntimeDatabase(options.dbPath);
  const repo = createStorageRepository(db);

  const ok = <TPayload>(command: IRuntimeCommand, payload: TPayload): IRuntimeReply<TPayload> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'storage',
      target: command.source,
      type: `${command.type}.reply`,
      ok: true,
      payload,
    });

  const fail = (command: IRuntimeCommand, code: string, message: string, retryable = false): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'storage',
      target: command.source,
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error: { code, message, retryable },
    });

  const invalidCommand = (command: IRuntimeCommand, error: IInvalidWorkerCommand): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'storage',
      target: 'supervisor',
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error,
    });

  return {
    async handleCommand(command: IRuntimeCommand): Promise<IRuntimeReply> {
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'storage', namespace: 'storage' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'storage.health') {
          return ok(command, { ok: true });
        }
        if (command.type === 'storage.create-workspace') {
          const input = parseRuntimeCommandPayload('storage.create-workspace', command.payload);
          return ok(command, repo.createWorkspace(input));
        }
        if (command.type === 'storage.ensure-workspace-pane') {
          const input = parseRuntimeCommandPayload('storage.ensure-workspace-pane', command.payload);
          return ok(command, repo.ensureWorkspacePane(input));
        }
        if (command.type === 'storage.create-pending-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.create-pending-terminal-tab', command.payload);
          return ok(command, repo.createPendingTerminalTab(input));
        }
        if (command.type === 'storage.finalize-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.finalize-terminal-tab', command.payload);
          return ok(command, repo.finalizeTerminalTab(input));
        }
        if (command.type === 'storage.fail-pending-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.fail-pending-terminal-tab', command.payload);
          repo.failPendingTerminalTab(input);
          return ok(command, { ok: true });
        }
        if (command.type === 'storage.list-pending-terminal-tabs') {
          return ok(command, repo.listPendingTerminalTabs());
        }
        if (command.type === 'storage.list-ready-terminal-tabs') {
          return ok(command, repo.listReadyTerminalTabs());
        }
        if (command.type === 'storage.fail-ready-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.fail-ready-terminal-tab', command.payload);
          repo.failReadyTerminalTab(input);
          return ok(command, { ok: true });
        }
        if (command.type === 'storage.get-ready-terminal-tab-by-session') {
          const input = parseRuntimeCommandPayload('storage.get-ready-terminal-tab-by-session', command.payload);
          return ok(command, repo.getReadyTerminalTabBySession(input.sessionName));
        }
        if (command.type === 'storage.delete-workspace') {
          const input = parseRuntimeCommandPayload('storage.delete-workspace', command.payload);
          return ok(command, repo.deleteWorkspace(input));
        }
        if (command.type === 'storage.delete-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.delete-terminal-tab', command.payload);
          return ok(command, repo.deleteTerminalTab(input));
        }
        if (command.type === 'storage.list-workspaces') {
          return ok(command, repo.listWorkspaces());
        }
        if (command.type === 'storage.get-layout') {
          const input = parseRuntimeCommandPayload('storage.get-layout', command.payload);
          return ok(command, repo.getWorkspaceLayout(input.workspaceId));
        }
        if (command.type === 'storage.list-session-annotations') {
          const input = parseRuntimeCommandPayload('storage.list-session-annotations', command.payload);
          return ok(command, repo.listSessionAnnotations(input.sessionIds));
        }
        if (command.type === 'storage.select-session-annotations') {
          const input = parseRuntimeCommandPayload('storage.select-session-annotations', command.payload);
          return ok(command, repo.selectSessionAnnotations(input));
        }
        if (command.type === 'storage.update-session-annotation') {
          const input = parseRuntimeCommandPayload('storage.update-session-annotation', command.payload);
          return ok(command, repo.updateSessionAnnotation(input));
        }
        if (command.type === 'storage.list-saved-session-filters') {
          parseRuntimeCommandPayload('storage.list-saved-session-filters', command.payload);
          return ok(command, repo.listSavedSessionFilters());
        }
        if (command.type === 'storage.upsert-saved-session-filter') {
          const input = parseRuntimeCommandPayload('storage.upsert-saved-session-filter', command.payload);
          return ok(command, repo.upsertSavedSessionFilter(input));
        }
        if (command.type === 'storage.delete-saved-session-filter') {
          const input = parseRuntimeCommandPayload('storage.delete-saved-session-filter', command.payload);
          return ok(command, { deleted: repo.deleteSavedSessionFilter(input.id) });
        }
        if (command.type === 'storage.register-approved-project-root') {
          const input = parseRuntimeCommandPayload('storage.register-approved-project-root', command.payload);
          return ok(command, repo.registerApprovedProjectRoot(input));
        }
        if (command.type === 'storage.list-approved-project-roots') {
          parseRuntimeCommandPayload('storage.list-approved-project-roots', command.payload);
          return ok(command, repo.listApprovedProjectRoots());
        }
        if (command.type === 'storage.list-approved-project-root-snapshots') {
          parseRuntimeCommandPayload('storage.list-approved-project-root-snapshots', command.payload);
          return ok(command, repo.listApprovedProjectRootSnapshots());
        }
        if (command.type === 'storage.register-managed-project') {
          const input = parseRuntimeCommandPayload('storage.register-managed-project', command.payload);
          return ok(command, repo.registerManagedProject(input));
        }
        if (command.type === 'storage.list-managed-projects') {
          parseRuntimeCommandPayload('storage.list-managed-projects', command.payload);
          return ok(command, repo.listManagedProjects());
        }
        if (command.type === 'storage.list-managed-project-snapshots') {
          parseRuntimeCommandPayload('storage.list-managed-project-snapshots', command.payload);
          return ok(command, repo.listManagedProjectSnapshots());
        }
        if (command.type === 'storage.apply-managed-project-import') {
          const input = parseRuntimeCommandPayload('storage.apply-managed-project-import', command.payload);
          return ok(command, repo.applyManagedProjectImport(input));
        }
        if (command.type === 'storage.list-governance-audit-events') {
          const input = parseRuntimeCommandPayload('storage.list-governance-audit-events', command.payload);
          return ok(command, repo.listGovernanceAuditEvents(input));
        }
        return invalidCommand(command, {
          code: 'invalid-worker-command',
          message: `Unsupported storage command: ${command.type}`,
          retryable: false,
        });
      } catch (err) {
        const maybeStructured = err as { code?: string; retryable?: boolean } | null;
        return fail(
          command,
          maybeStructured?.code ?? 'command-failed',
          err instanceof Error ? err.message : String(err),
          maybeStructured?.retryable ?? false,
        );
      }
    },

    close(): void {
      db.close();
    },
  };
};
