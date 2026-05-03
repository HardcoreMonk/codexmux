import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  IRuntimeCreateWorkspaceResult,
  IRuntimeDeleteTerminalTabResult,
  IRuntimeDeleteTerminalTabStorageResult,
  IRuntimeDeleteWorkspaceResult,
  IRuntimeDeleteWorkspaceStorageResult,
  IRuntimeHealth,
  IRuntimeStatusNotificationPolicyInput,
  IRuntimeStatusNotificationPolicyResult,
  IRuntimeTerminalSessionPresence,
  IRuntimeTerminalTab,
  IRuntimeTimelineEntriesBeforeInput,
  IRuntimeTimelineSessionListInput,
  IRuntimeTimelineSessionPage,
  TRuntimeTimelineEntriesBeforeResult,
  TRuntimeTimelineMessageCounts,
  TRuntimeStatusCodexStateInput,
  TRuntimeStatusDecision,
  TRuntimeStatusHookDecision,
  TRuntimeStatusHookStateInput,
  IRuntimeWorkspace,
  TRuntimeLayout,
} from '@/lib/runtime/contracts';
import { createRuntimeId, createRuntimeSessionName, parseRuntimeSessionName } from '@/lib/runtime/session-name';
import { RuntimeWorkerClient } from '@/lib/runtime/worker-client';
import type { IRuntimeEvent, TRuntimeMessage } from '@/lib/runtime/ipc';

interface IRuntimeWorkerClientLike {
  start(): void;
  waitUntilReady(): Promise<void>;
  shutdown(): void;
  request<TPayload, TResult>(type: string, payload: TPayload): Promise<TResult>;
}

export interface IRuntimeSupervisor {
  ensureStarted(): Promise<void>;
  shutdown(): void;
  health(): Promise<IRuntimeHealth>;
  listWorkspaces(): Promise<IRuntimeWorkspace[]>;
  createWorkspace(input: { name: string; defaultCwd: string }): Promise<IRuntimeCreateWorkspaceResult>;
  deleteWorkspace(workspaceId: string): Promise<IRuntimeDeleteWorkspaceResult>;
  deleteTerminalTab(tabId: string): Promise<IRuntimeDeleteTerminalTabResult>;
  listTimelineSessions(input: IRuntimeTimelineSessionListInput): Promise<IRuntimeTimelineSessionPage>;
  readTimelineEntriesBefore(input: IRuntimeTimelineEntriesBeforeInput): Promise<TRuntimeTimelineEntriesBeforeResult>;
  getTimelineMessageCounts(jsonlPath: string): Promise<TRuntimeTimelineMessageCounts>;
  reduceStatusHookState(input: TRuntimeStatusHookStateInput): Promise<TRuntimeStatusHookDecision>;
  reduceStatusCodexState(input: TRuntimeStatusCodexStateInput): Promise<TRuntimeStatusDecision>;
  evaluateStatusNotificationPolicy(input: IRuntimeStatusNotificationPolicyInput): Promise<IRuntimeStatusNotificationPolicyResult>;
  createTerminalTab(input: { workspaceId: string; paneId: string; cwd: string }): Promise<IRuntimeTerminalTab>;
  getLayout(workspaceId: string): Promise<TRuntimeLayout>;
  attachTerminal(input: {
    sessionName: string;
    cols: number;
    rows: number;
    send: (data: string) => void;
    close: (code: number, reason: string) => void;
  }): Promise<{ subscriberId: string }>;
  detachTerminal(input: { sessionName: string; subscriberId: string }): Promise<void>;
  writeTerminal(input: { sessionName: string; subscriberId: string; data: string }): Promise<void>;
  resizeTerminal(input: { sessionName: string; subscriberId: string; cols: number; rows: number }): Promise<void>;
}

interface IRuntimeSupervisorGlobalState {
  __ptRuntimeSupervisor?: IRuntimeSupervisor;
  __ptRuntimeSupervisorStartPromise?: Promise<void>;
  __ptRuntimeSupervisorPreparedDbPath?: string | null;
}

interface ITerminalSubscriber {
  send: (data: string) => void;
  close: (code: number, reason: string) => void;
}

interface ITerminalAttachAttempt {
  subscriberIds: Set<string>;
  attachRequested: boolean;
  promise: Promise<void>;
}

interface IRuntimeSupervisorClients {
  storage: IRuntimeWorkerClientLike;
  terminal: IRuntimeWorkerClientLike;
  timeline: IRuntimeWorkerClientLike;
  status: IRuntimeWorkerClientLike;
}

export interface ICreateRuntimeSupervisorForTestOptions {
  storage?: IRuntimeWorkerClientLike;
  terminal?: IRuntimeWorkerClientLike;
  timeline?: IRuntimeWorkerClientLike;
  status?: IRuntimeWorkerClientLike;
  createStorageClient?: () => IRuntimeWorkerClientLike;
  createTerminalClient?: (handlers: { onEvent: (event: TRuntimeMessage) => void; onExit: () => void }) => IRuntimeWorkerClientLike;
  createTimelineClient?: () => IRuntimeWorkerClientLike;
  createStatusClient?: () => IRuntimeWorkerClientLike;
  captureTerminalEventHandler?: (handler: (event: IRuntimeEvent) => void) => void;
  dbPath?: string;
  runtimeReset?: boolean;
  useGlobal?: boolean;
}

const g = globalThis as unknown as IRuntimeSupervisorGlobalState;

const getDbPath = (): string =>
  process.env.CODEXMUX_RUNTIME_DB || path.join(process.env.HOME || os.homedir(), '.codexmux', 'runtime-v2', 'state.db');

const runtimeDbFiles = (dbPath: string): string[] => [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

const hasRuntimeDbFiles = (dbPath: string): boolean =>
  runtimeDbFiles(dbPath).some((filePath) => fs.existsSync(filePath));

const backupRuntimeDbFiles = (dbPath: string): void => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const filePath of runtimeDbFiles(dbPath)) {
    if (!fs.existsSync(filePath)) continue;
    fs.renameSync(filePath, `${filePath}.${stamp}.bak`);
  }
};

const tabId = (): string => createRuntimeId('tab');

const sessionNameFor = (workspaceId: string, paneId: string, tab: string): string =>
  createRuntimeSessionName({ workspaceId, paneId, tabId: tab });

const parseRuntimeSessionNameOrNull = (sessionName: string): string | null => {
  try {
    return parseRuntimeSessionName(sessionName);
  } catch {
    return null;
  }
};

export const createRuntimeSupervisorForTest = (
  options: ICreateRuntimeSupervisorForTestOptions = {},
): IRuntimeSupervisor => {
  if (options.useGlobal && g.__ptRuntimeSupervisor) return g.__ptRuntimeSupervisor;

  let started = false;
  let startPromise: Promise<void> | undefined;
  let preparedDbPath: string | null = null;
  let reconciledTerminalTabs = false;
  let clients: IRuntimeSupervisorClients | null = null;
  const terminalSubscribers = new Map<string, Map<string, ITerminalSubscriber>>();
  const terminalAttachAttempts = new Map<string, ITerminalAttachAttempt>();

  const prepareRuntimeDbPath = (): string => {
    if (options.useGlobal && g.__ptRuntimeSupervisorPreparedDbPath) return g.__ptRuntimeSupervisorPreparedDbPath;
    if (preparedDbPath) return preparedDbPath;

    const dbPath = options.dbPath ?? getDbPath();
    const reset = options.runtimeReset ?? process.env.CODEXMUX_RUNTIME_V2_RESET === '1';
    if (reset && hasRuntimeDbFiles(dbPath)) backupRuntimeDbFiles(dbPath);
    preparedDbPath = dbPath;
    if (options.useGlobal) g.__ptRuntimeSupervisorPreparedDbPath = dbPath;
    return dbPath;
  };

  const closeTerminalSubscribers = (sessionName: string, code: number, reason: string): void => {
    const sessionSubscribers = terminalSubscribers.get(sessionName);
    sessionSubscribers?.forEach((subscriber) => subscriber.close(code, reason));
    terminalSubscribers.delete(sessionName);
  };

  const onTerminalWorkerEvent = (event: IRuntimeEvent): void => {
    const payload = event.payload as { sessionName?: string; data?: string };
    const sessionName = payload.sessionName;
    if (!sessionName) return;
    if (event.type === 'terminal.stdout') {
      if (typeof payload.data !== 'string') return;
      terminalSubscribers.get(sessionName)?.forEach((subscriber) => subscriber.send(payload.data as string));
      return;
    }
    if (event.type === 'terminal.backpressure') {
      closeTerminalSubscribers(sessionName, 1011, 'Terminal output backpressure');
    }
  };

  const onTerminalWorkerMessage = (message: TRuntimeMessage): void => {
    if (message.kind !== 'event') return;
    onTerminalWorkerEvent(message);
  };

  const onTerminalWorkerExit = (): void => {
    for (const sessionSubscribers of terminalSubscribers.values()) {
      sessionSubscribers.forEach((subscriber) => subscriber.close(1011, 'Terminal worker exited'));
    }
    terminalSubscribers.clear();
    terminalAttachAttempts.clear();
  };

  options.captureTerminalEventHandler?.(onTerminalWorkerEvent);

  const createClients = (): IRuntimeSupervisorClients => ({
    storage: options.storage ?? options.createStorageClient?.() ?? new RuntimeWorkerClient({
      name: 'storage',
      workerName: 'storage-worker',
      readinessCommand: 'storage.health',
    }),
    terminal: options.terminal ?? options.createTerminalClient?.({
      onEvent: onTerminalWorkerMessage,
      onExit: onTerminalWorkerExit,
    }) ?? new RuntimeWorkerClient({
      name: 'terminal',
      workerName: 'terminal-worker',
      readinessCommand: 'terminal.health',
      onEvent: onTerminalWorkerMessage,
      onExit: onTerminalWorkerExit,
    }),
    timeline: options.timeline ?? options.createTimelineClient?.() ?? new RuntimeWorkerClient({
      name: 'timeline',
      workerName: 'timeline-worker',
      readinessCommand: 'timeline.health',
    }),
    status: options.status ?? options.createStatusClient?.() ?? new RuntimeWorkerClient({
      name: 'status',
      workerName: 'status-worker',
      readinessCommand: 'status.health',
    }),
  });

  const getClients = (): IRuntimeSupervisorClients => {
    clients ??= createClients();
    return clients;
  };

  const shutdownClients = (): void => {
    clients?.terminal.shutdown();
    clients?.timeline.shutdown();
    clients?.status.shutdown();
    clients?.storage.shutdown();
    clients = null;
  };

  const getTerminalSubscriberCount = (sessionName: string): number =>
    terminalSubscribers.get(sessionName)?.size ?? 0;

  const addTerminalSubscriber = (
    sessionName: string,
    subscriber: ITerminalSubscriber,
  ): { subscriberId: string; shouldAttach: boolean } => {
    const subscriberId = createRuntimeId('sub');
    const sessionSubscribers = terminalSubscribers.get(sessionName) ?? new Map<string, ITerminalSubscriber>();
    const shouldAttach = sessionSubscribers.size === 0;
    sessionSubscribers.set(subscriberId, subscriber);
    terminalSubscribers.set(sessionName, sessionSubscribers);
    return { subscriberId, shouldAttach };
  };

  const removeTerminalSubscribers = (sessionName: string, subscriberIds: Iterable<string>): void => {
    const sessionSubscribers = terminalSubscribers.get(sessionName);
    if (!sessionSubscribers) return;
    for (const subscriberId of subscriberIds) {
      sessionSubscribers.delete(subscriberId);
    }
    if (sessionSubscribers.size === 0) terminalSubscribers.delete(sessionName);
  };

  const waitForTerminalAttachAttempt = async (sessionName: string): Promise<void> => {
    await terminalAttachAttempts.get(sessionName)?.promise.catch(() => undefined);
  };

  const assertActiveTerminalSubscriber = (input: { sessionName: string; subscriberId: string }): string => {
    const sessionName = parseRuntimeSessionName(input.sessionName);
    if (terminalSubscribers.get(sessionName)?.has(input.subscriberId)) return sessionName;
    throw Object.assign(
      new Error(`runtime v2 terminal subscriber is not active: ${input.subscriberId}`),
      { code: 'runtime-v2-terminal-subscriber-not-found', retryable: false },
    );
  };

  const assertReadyTerminalSession = async (sessionName: string): Promise<string> => {
    const parsedSessionName = parseRuntimeSessionName(sessionName);
    const { storage } = getClients();
    const tab = await storage.request<{ sessionName: string }, IRuntimeTerminalTab | null>(
      'storage.get-ready-terminal-tab-by-session',
      { sessionName: parsedSessionName },
    );
    if (!tab) {
      throw Object.assign(
        new Error(`runtime v2 terminal session is not ready: ${parsedSessionName}`),
        { code: 'runtime-v2-terminal-session-not-found', retryable: false },
      );
    }
    return parsedSessionName;
  };

  const reconcilePendingTerminalTabs = async (): Promise<void> => {
    const { storage, terminal } = getClients();
    const pendingTabs = await storage.request<Record<string, never>, Array<{ id: string; sessionName: string }>>(
      'storage.list-pending-terminal-tabs',
      {},
    );
    for (const tab of pendingTabs) {
      const sessionName = parseRuntimeSessionNameOrNull(tab.sessionName);
      if (sessionName) {
        await terminal.request('terminal.kill-session', { sessionName }).catch(() => undefined);
      }
      await storage.request('storage.fail-pending-terminal-tab', {
        id: tab.id,
        reason: sessionName ? 'startup reconciliation' : 'startup reconciliation: invalid session name',
      });
    }
  };

  const reconcileReadyTerminalTabs = async (): Promise<void> => {
    const { storage, terminal } = getClients();
    const readyTabs = await storage.request<Record<string, never>, IRuntimeTerminalTab[]>(
      'storage.list-ready-terminal-tabs',
      {},
    );
    for (const tab of readyTabs) {
      const sessionName = parseRuntimeSessionNameOrNull(tab.sessionName);
      if (!sessionName) {
        await storage.request('storage.fail-ready-terminal-tab', {
          id: tab.id,
          reason: 'startup reconciliation: invalid session name',
        });
        continue;
      }
      let exists = false;
      try {
        const presence = await terminal.request<{ sessionName: string }, IRuntimeTerminalSessionPresence>(
          'terminal.has-session',
          { sessionName },
        );
        exists = presence.exists;
      } catch (err) {
        const maybeStructured = err as { code?: string } | null;
        if (maybeStructured?.code !== 'runtime-v2-terminal-session-not-found') throw err;
      }
      if (!exists) {
        await storage.request('storage.fail-ready-terminal-tab', {
          id: tab.id,
          reason: 'startup reconciliation: tmux session missing',
        });
      }
    }
  };

  const reconcileTerminalTabs = async (): Promise<void> => {
    if (reconciledTerminalTabs) return;
    await reconcilePendingTerminalTabs();
    await reconcileReadyTerminalTabs();
    reconciledTerminalTabs = true;
  };

  const startInternal = async (): Promise<void> => {
    if (started) return;
    process.env.CODEXMUX_RUNTIME_DB = prepareRuntimeDbPath();
    const { storage, terminal, timeline, status } = getClients();
    try {
      storage.start();
      await storage.waitUntilReady();
      terminal.start();
      await terminal.waitUntilReady();
      timeline.start();
      await timeline.waitUntilReady();
      status.start();
      await status.waitUntilReady();
      await reconcileTerminalTabs();
      started = true;
    } catch (err) {
      started = false;
      reconciledTerminalTabs = false;
      shutdownClients();
      throw err;
    }
  };

  const supervisor: IRuntimeSupervisor = {
    async ensureStarted() {
      if (started) return;
      const readStartPromise = (): Promise<void> | undefined =>
        options.useGlobal ? g.__ptRuntimeSupervisorStartPromise : startPromise;
      const writeStartPromise = (value: Promise<void> | undefined): void => {
        if (options.useGlobal) g.__ptRuntimeSupervisorStartPromise = value;
        else startPromise = value;
      };
      if (!readStartPromise()) {
        writeStartPromise(startInternal().catch((err) => {
          if (!started) writeStartPromise(undefined);
          throw err;
        }));
      }
      await readStartPromise();
    },

    shutdown() {
      shutdownClients();
      started = false;
      reconciledTerminalTabs = false;
      startPromise = undefined;
      if (options.useGlobal) g.__ptRuntimeSupervisorStartPromise = undefined;
      terminalSubscribers.clear();
      terminalAttachAttempts.clear();
    },

    async health() {
      await this.ensureStarted();
      const { storage, terminal, timeline, status } = getClients();
      const [storageHealth, terminalHealth, timelineHealth, statusHealth] = await Promise.all([
        storage.request('storage.health', {}),
        terminal.request('terminal.health', {}),
        timeline.request('timeline.health', {}),
        status.request('status.health', {}),
      ]);
      return { ok: true, storage: storageHealth, terminal: terminalHealth, timeline: timelineHealth, status: statusHealth };
    },

    async listWorkspaces() {
      await this.ensureStarted();
      return getClients().storage.request<Record<string, never>, IRuntimeWorkspace[]>('storage.list-workspaces', {});
    },

    async createWorkspace(input) {
      await this.ensureStarted();
      return getClients().storage.request<typeof input, IRuntimeCreateWorkspaceResult>('storage.create-workspace', input);
    },

    async deleteWorkspace(workspaceId) {
      await this.ensureStarted();
      const { storage, terminal } = getClients();
      const result = await storage.request<{ workspaceId: string }, IRuntimeDeleteWorkspaceStorageResult>(
        'storage.delete-workspace',
        { workspaceId },
      );
      if (!result.deleted) return { deleted: false, killedSessions: [], failedKills: [] };
      const killedSessions: string[] = [];
      const failedKills: Array<{ sessionName: string; error: string }> = [];
      for (const session of result.sessions) {
        const sessionName = parseRuntimeSessionNameOrNull(session.sessionName);
        if (!sessionName) {
          failedKills.push({ sessionName: session.sessionName, error: 'invalid runtime session name' });
          continue;
        }
        closeTerminalSubscribers(sessionName, 1000, 'Workspace deleted');
        await waitForTerminalAttachAttempt(sessionName);
        try {
          await terminal.request('terminal.kill-session', { sessionName });
          killedSessions.push(sessionName);
        } catch (err) {
          failedKills.push({
            sessionName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { deleted: true, killedSessions, failedKills };
    },

    async deleteTerminalTab(tabId) {
      await this.ensureStarted();
      const { storage, terminal } = getClients();
      const result = await storage.request<{ id: string }, IRuntimeDeleteTerminalTabStorageResult>(
        'storage.delete-terminal-tab',
        { id: tabId },
      );
      if (!result.deleted || !result.session) {
        return { deleted: result.deleted, killedSession: null, failedKill: null };
      }

      const sessionName = parseRuntimeSessionNameOrNull(result.session.sessionName);
      if (!sessionName) {
        return {
          deleted: true,
          killedSession: null,
          failedKill: {
            sessionName: result.session.sessionName,
            error: 'invalid runtime session name',
          },
        };
      }

      closeTerminalSubscribers(sessionName, 1000, 'Tab deleted');
      await waitForTerminalAttachAttempt(sessionName);
      try {
        await terminal.request('terminal.kill-session', { sessionName });
        return { deleted: true, killedSession: sessionName, failedKill: null };
      } catch (err) {
        return {
          deleted: true,
          killedSession: null,
          failedKill: {
            sessionName,
            error: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },

    async listTimelineSessions(input) {
      await this.ensureStarted();
      return getClients().timeline.request<IRuntimeTimelineSessionListInput, IRuntimeTimelineSessionPage>(
        'timeline.list-sessions',
        input,
      );
    },

    async readTimelineEntriesBefore(input) {
      await this.ensureStarted();
      return getClients().timeline.request<IRuntimeTimelineEntriesBeforeInput, TRuntimeTimelineEntriesBeforeResult>(
        'timeline.read-entries-before',
        input,
      );
    },

    async getTimelineMessageCounts(jsonlPath) {
      await this.ensureStarted();
      return getClients().timeline.request<{ jsonlPath: string }, TRuntimeTimelineMessageCounts>(
        'timeline.message-counts',
        { jsonlPath },
      );
    },

    async reduceStatusHookState(input) {
      await this.ensureStarted();
      return getClients().status.request<TRuntimeStatusHookStateInput, TRuntimeStatusHookDecision>(
        'status.reduce-hook-state',
        input,
      );
    },

    async reduceStatusCodexState(input) {
      await this.ensureStarted();
      return getClients().status.request<TRuntimeStatusCodexStateInput, TRuntimeStatusDecision>(
        'status.reduce-codex-state',
        input,
      );
    },

    async evaluateStatusNotificationPolicy(input) {
      await this.ensureStarted();
      return getClients().status.request<IRuntimeStatusNotificationPolicyInput, IRuntimeStatusNotificationPolicyResult>(
        'status.evaluate-notification-policy',
        input,
      );
    },

    async createTerminalTab(input) {
      await this.ensureStarted();
      const { storage, terminal } = getClients();
      const id = tabId();
      const sessionName = sessionNameFor(input.workspaceId, input.paneId, id);
      const storageInput = { ...input, id, sessionName };
      await storage.request<typeof storageInput, { id: string; sessionName: string }>(
        'storage.create-pending-terminal-tab',
        storageInput,
      );
      try {
        await terminal.request('terminal.create-session', {
          sessionName,
          cols: 80,
          rows: 24,
          cwd: input.cwd,
        });
        return await storage.request<{ id: string }, IRuntimeTerminalTab>('storage.finalize-terminal-tab', { id });
      } catch (err) {
        await terminal.request('terminal.kill-session', { sessionName }).catch(() => undefined);
        await storage.request('storage.fail-pending-terminal-tab', {
          id,
          reason: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    async getLayout(workspaceId) {
      await this.ensureStarted();
      return getClients().storage.request<{ workspaceId: string }, TRuntimeLayout>('storage.get-layout', { workspaceId });
    },

    async attachTerminal(input) {
      await this.ensureStarted();
      const { terminal } = getClients();
      const sessionName = await assertReadyTerminalSession(input.sessionName);
      const existingAttachAttempt = terminalAttachAttempts.get(sessionName);
      const { subscriberId, shouldAttach } = addTerminalSubscriber(sessionName, {
        send: input.send,
        close: input.close,
      });
      const ownsAttachAttempt = !existingAttachAttempt && shouldAttach;
      const attachAttempt = existingAttachAttempt ?? (ownsAttachAttempt
        ? { subscriberIds: new Set<string>(), attachRequested: false, promise: Promise.resolve() }
        : null);
      attachAttempt?.subscriberIds.add(subscriberId);
      if (ownsAttachAttempt && attachAttempt) {
        attachAttempt.promise = (async () => {
          attachAttempt.attachRequested = true;
          await terminal.request('terminal.attach', {
            sessionName,
            cols: input.cols,
            rows: input.rows,
          });
        })();
        terminalAttachAttempts.set(sessionName, attachAttempt);
      }
      try {
        await attachAttempt?.promise;
        return { subscriberId };
      } catch (err) {
        removeTerminalSubscribers(sessionName, attachAttempt?.subscriberIds ?? [subscriberId]);
        if (ownsAttachAttempt && attachAttempt?.attachRequested) {
          await terminal.request('terminal.detach', { sessionName }).catch(() => undefined);
        }
        throw err;
      } finally {
        if (ownsAttachAttempt && terminalAttachAttempts.get(sessionName) === attachAttempt) {
          terminalAttachAttempts.delete(sessionName);
        }
      }
    },

    async detachTerminal(input) {
      const sessionName = parseRuntimeSessionName(input.sessionName);
      const sessionSubscribers = terminalSubscribers.get(sessionName);
      if (!sessionSubscribers) return;
      sessionSubscribers.delete(input.subscriberId);
      const remaining = getTerminalSubscriberCount(sessionName);
      if (remaining > 0) return;
      terminalSubscribers.delete(sessionName);
      await getClients().terminal.request('terminal.detach', { sessionName }).catch(() => undefined);
    },

    async writeTerminal(input) {
      await this.ensureStarted();
      const sessionName = assertActiveTerminalSubscriber(input);
      await getClients().terminal.request('terminal.write-stdin', {
        sessionName,
        data: input.data,
      });
    },

    async resizeTerminal(input) {
      await this.ensureStarted();
      const sessionName = assertActiveTerminalSubscriber(input);
      await getClients().terminal.request('terminal.resize', {
        sessionName,
        cols: input.cols,
        rows: input.rows,
      });
    },
  };

  if (options.useGlobal) g.__ptRuntimeSupervisor = supervisor;
  return supervisor;
};

export const getRuntimeSupervisor = (): IRuntimeSupervisor => {
  if (g.__ptRuntimeSupervisor) return g.__ptRuntimeSupervisor;
  return createRuntimeSupervisorForTest({ useGlobal: true });
};
