import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { createStorageWorkerService } from '@/lib/runtime/storage/worker-service';

describe('storage worker service', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-storage-worker-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles health and workspace creation commands', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });

    const health = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.health',
      payload: {},
    }));

    expect(health.ok).toBe(true);
    expect(health.payload).toEqual({ ok: true });

    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));

    expect(created.ok).toBe(true);
    expect(created.payload).toEqual(expect.objectContaining({ id: expect.stringMatching(/^ws-/) }));
  });

  it('returns structured errors for invalid worker commands', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const unknown = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.unknown',
      payload: {},
    }));
    const wrongSource = await service.handleCommand(createRuntimeCommand({
      source: 'browser',
      target: 'storage',
      type: 'storage.health',
      payload: {},
    }));
    const wrongTarget = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'storage.health',
      payload: {},
    }));
    const wrongNamespace = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'terminal.health',
      payload: {},
    }));

    for (const reply of [unknown, wrongSource, wrongTarget, wrongNamespace]) {
      expect(reply.ok).toBe(false);
      expect(reply.error).toMatchObject({
        code: 'invalid-worker-command',
        retryable: false,
      });
    }
  });

  it('handles pending terminal tab intent lifecycle commands', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };

    const pending = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`,
        cwd: dir,
      },
    }));

    expect(pending.ok).toBe(true);
    expect(pending.payload).toEqual(expect.objectContaining({ lifecycleState: 'pending_terminal' }));

    const finalized = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    expect(finalized.ok).toBe(true);
    expect(finalized.payload).toEqual(expect.objectContaining({ id: 'tab-runtime', lifecycleState: 'ready' }));

    const finalizedAgain = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    expect(finalizedAgain.ok).toBe(false);
    expect(finalizedAgain.error).toMatchObject({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    });

    const missingFinalize = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-missing' },
    }));

    expect(missingFinalize.ok).toBe(false);
    expect(missingFinalize.error).toMatchObject({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    });
  });

  it('rejects terminal tab intents for panes outside the supplied workspace', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const other = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Other', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };
    const otherWorkspace = other.payload as { id: string; rootPaneId: string };

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: otherWorkspace.rootPaneId,
        sessionName: `rtv2-${workspace.id}-${otherWorkspace.rootPaneId}-tab-runtime`,
        cwd: dir,
      },
    }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatchObject({
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    });
  });

  it('deletes workspaces and returns cleanup sessions from the delete command', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`,
        cwd: dir,
      },
    }));

    const deleted = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.delete-workspace',
      payload: { workspaceId: workspace.id },
    }));
    expect(deleted.payload).toEqual({
      deleted: true,
      sessions: [{ sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime` }],
    });
  });

  it('returns only ready terminal tabs for attach authorization', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };
    const sessionName = `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`;

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName,
        cwd: dir,
      },
    }));

    const pendingLookup = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.get-ready-terminal-tab-by-session',
      payload: { sessionName },
    }));
    expect(pendingLookup.payload).toBeNull();

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    const readyLookup = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.get-ready-terminal-tab-by-session',
      payload: { sessionName },
    }));
    expect(readyLookup.payload).toEqual(expect.objectContaining({ id: 'tab-runtime', lifecycleState: 'ready' }));
  });

  it('lists ready terminal tabs and marks stale ready tabs failed', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };
    const sessionName = `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`;

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName,
        cwd: dir,
      },
    }));
    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    const readyList = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.list-ready-terminal-tabs',
      payload: {},
    }));
    expect(readyList.ok).toBe(true);
    expect(readyList.payload).toEqual([
      expect.objectContaining({ id: 'tab-runtime', sessionName, lifecycleState: 'ready' }),
    ]);

    const failed = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.fail-ready-terminal-tab',
      payload: {
        id: 'tab-runtime',
        reason: 'startup reconciliation: tmux session missing',
      },
    }));
    expect(failed.ok).toBe(true);
    expect(failed.payload).toEqual({ ok: true });

    const emptyReadyList = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.list-ready-terminal-tabs',
      payload: {},
    }));
    expect(emptyReadyList.payload).toEqual([]);

    const failedAgain = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.fail-ready-terminal-tab',
      payload: { id: 'tab-runtime', reason: 'already failed' },
    }));
    expect(failedAgain.ok).toBe(false);
    expect(failedAgain.error).toMatchObject({
      code: 'runtime-v2-ready-tab-not-found',
      retryable: false,
    });
  });
});
