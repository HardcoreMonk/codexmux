import { stat } from 'fs/promises';
import {
  createRuntimeReply,
  parseRuntimeCommandPayload,
  type IRuntimeCommand,
  type IRuntimeReply,
} from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope, type IInvalidWorkerCommand } from '@/lib/runtime/worker-command-validation';
import { isAllowedJsonlPath } from '@/lib/path-validation';
import { getProviderByPanelType } from '@/lib/providers';
import { normalizePanelType } from '@/lib/panel-type';
import { listSessionPage } from '@/lib/session-list';
import { countTimelineMessages, emptyMessageCounts, type IMessageCountResult } from '@/lib/timeline-message-counts';
import type {
  IRuntimeTimelineEntriesBeforeInput,
  IRuntimeTimelineSessionListInput,
  TRuntimeTimelineEntriesBeforeResult,
} from '@/lib/runtime/contracts';

interface IMessageCountCacheEntry {
  counts: IMessageCountResult;
  mtime: number;
  size: number;
}

const CACHE_LIMIT = 100;

export const createTimelineWorkerService = () => {
  const messageCountsCache = new Map<string, IMessageCountCacheEntry>();

  const ok = <TPayload>(command: IRuntimeCommand, payload: TPayload): IRuntimeReply<TPayload> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'timeline',
      target: command.source,
      type: `${command.type}.reply`,
      ok: true,
      payload,
    });

  const fail = (command: IRuntimeCommand, code: string, message: string, retryable = false): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'timeline',
      target: command.source,
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error: { code, message, retryable },
    });

  const invalidCommand = (command: IRuntimeCommand, error: IInvalidWorkerCommand): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'timeline',
      target: 'supervisor',
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error,
    });

  const assertAllowedJsonlPath = (command: IRuntimeCommand, jsonlPath: string): IRuntimeReply<null> | null =>
    isAllowedJsonlPath(jsonlPath)
      ? null
      : fail(command, 'timeline-jsonl-path-forbidden', 'Path not allowed');

  const getCachedCounts = (key: string, mtime: number, size: number): IMessageCountResult | null => {
    const cached = messageCountsCache.get(key);
    if (!cached) return null;
    if (cached.mtime !== mtime || cached.size !== size) {
      messageCountsCache.delete(key);
      return null;
    }
    messageCountsCache.delete(key);
    messageCountsCache.set(key, cached);
    return cached.counts;
  };

  const setCachedCounts = (key: string, counts: IMessageCountResult, mtime: number, size: number): void => {
    if (messageCountsCache.has(key)) messageCountsCache.delete(key);
    messageCountsCache.set(key, { counts, mtime, size });
    while (messageCountsCache.size > CACHE_LIMIT) {
      const oldest = messageCountsCache.keys().next().value;
      if (oldest === undefined) break;
      messageCountsCache.delete(oldest);
    }
  };

  const listSessions = async (input: IRuntimeTimelineSessionListInput) => {
    const panelType = normalizePanelType(input.panelType) ?? 'codex';
    return listSessionPage(input.tmuxSession, input.cwd, panelType, {
      offset: input.offset,
      limit: input.limit,
      source: input.source,
      sourceId: input.sourceId,
    });
  };

  const readEntriesBefore = async (
    command: IRuntimeCommand,
    input: IRuntimeTimelineEntriesBeforeInput,
  ): Promise<IRuntimeReply<TRuntimeTimelineEntriesBeforeResult> | IRuntimeReply<null>> => {
    const forbidden = assertAllowedJsonlPath(command, input.jsonlPath);
    if (forbidden) return forbidden;

    const provider = getProviderByPanelType(input.panelType);
    if (!provider) {
      return fail(command, 'timeline-provider-unknown', `Unknown panel type: ${input.panelType}`);
    }

    const result = await provider.readEntriesBefore(input.jsonlPath, input.beforeByte, input.limit);
    return ok(command, {
      entries: result.entries,
      startByteOffset: result.startByteOffset,
      hasMore: result.hasMore,
    });
  };

  const getMessageCounts = async (
    command: IRuntimeCommand,
    jsonlPath: string,
  ): Promise<IRuntimeReply<IMessageCountResult> | IRuntimeReply<null>> => {
    const forbidden = assertAllowedJsonlPath(command, jsonlPath);
    if (forbidden) return forbidden;

    try {
      const st = await stat(jsonlPath);
      const mtime = Math.floor(st.mtimeMs);
      const size = st.size;
      const cached = getCachedCounts(jsonlPath, mtime, size);
      if (cached) return ok(command, cached);
      const counts = await countTimelineMessages(jsonlPath);
      setCachedCounts(jsonlPath, counts, mtime, size);
      return ok(command, counts);
    } catch {
      return ok(command, emptyMessageCounts());
    }
  };

  return {
    async handleCommand(command: IRuntimeCommand): Promise<IRuntimeReply> {
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'timeline', namespace: 'timeline' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'timeline.health') {
          return ok(command, { ok: true });
        }
        if (command.type === 'timeline.list-sessions') {
          const input = parseRuntimeCommandPayload('timeline.list-sessions', command.payload);
          return ok(command, await listSessions(input));
        }
        if (command.type === 'timeline.read-entries-before') {
          const input = parseRuntimeCommandPayload('timeline.read-entries-before', command.payload);
          return readEntriesBefore(command, input);
        }
        if (command.type === 'timeline.message-counts') {
          const input = parseRuntimeCommandPayload('timeline.message-counts', command.payload);
          return getMessageCounts(command, input.jsonlPath);
        }
        return invalidCommand(command, {
          code: 'invalid-worker-command',
          message: `Unsupported timeline command: ${command.type}`,
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
      messageCountsCache.clear();
    },
  };
};
