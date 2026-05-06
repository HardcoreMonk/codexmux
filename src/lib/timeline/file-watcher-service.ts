import { watch } from 'fs';
import type { FSWatcher } from 'fs';
import type { WebSocket } from 'ws';

import type { IAgentProvider } from '@/lib/providers';
import type { IFileWatcher } from '@/lib/timeline-server-state';
import { planTimelineAppendDelivery } from '@/lib/timeline/append-delivery';
import { readBoundedTimelineEntries } from '@/lib/timeline/file-read-service';
import { findLastTimelineUserMessage } from '@/lib/timeline/init-metadata';
import { getPerfNow, recordPerfCounter, recordPerfDuration } from '@/lib/perf-metrics';
import type { ITimelineEntry, TTimelineServerMessage } from '@/types/timeline';

type TWatchFile = (jsonlPath: string, listener: () => void) => FSWatcher;

export interface ICreateTimelineFileWatcherServiceOptions {
  debounceMs: number;
  maxWatcherRetries: number;
  retryDelayMs?: number;
  fileWatchers: Map<string, IFileWatcher>;
  watchFile?: TWatchFile;
  canSend: (ws: WebSocket) => boolean;
  broadcastWatcher: (jsonlPath: string, message: TTimelineServerMessage) => void;
  onLiveShadowAppend: (jsonlPath: string, entries: ITimelineEntry[]) => void;
  stopLiveShadow: (jsonlPath: string) => void | Promise<void>;
  onLastUserMessage: (sessionName: string, message: string) => void | Promise<void>;
  resolveAgentSummary: (
    provider: IAgentProvider,
    sessionName: string,
    jsonlSummary: string | null | undefined,
  ) => Promise<string | null>;
  onAgentSummary: (
    sessionName: string,
    provider: IAgentProvider,
    summary: string | null,
  ) => void | Promise<void>;
}

export const createTimelineFileWatcherService = (options: ICreateTimelineFileWatcherServiceOptions) => {
  const watchFile = options.watchFile ?? ((jsonlPath: string, listener: () => void) => watch(jsonlPath, listener));
  const retryDelayMs = options.retryDelayMs ?? 1000;

  const processFileChange = async (fw: IFileWatcher): Promise<void> => {
    if (fw.processing) {
      fw.pendingChange = true;
      return;
    }

    const startedAt = getPerfNow();
    fw.processing = true;
    try {
      const prevOffset = fw.offset;
      fw.tailSnapshot = undefined;
      const parseStartedAt = getPerfNow();
      const { newEntries, newOffset, pendingBuffer } = await fw.provider.parseIncremental(
        fw.jsonlPath,
        fw.offset,
        fw.pendingBuffer,
      );
      recordPerfDuration('timeline.parse_incremental', getPerfNow() - parseStartedAt);
      recordPerfCounter('timeline.parse_incremental.entries', newEntries.length);
      fw.pendingBuffer = pendingBuffer;

      if (newEntries.length === 0) return;

      fw.offset = newOffset;

      const msg: TTimelineServerMessage = { type: 'timeline:append', entries: newEntries };
      const str = JSON.stringify(msg);
      const partialReads: Promise<void>[] = [];
      const deliveryPlan = planTimelineAppendDelivery({
        previousOffset: prevOffset,
        newOffset,
        subscribers: Array.from(fw.connections, (ws) => ({
          target: ws,
          canSend: options.canSend(ws),
          initOffset: fw.initOffsets.get(ws),
        })),
      });

      for (const action of deliveryPlan.actions) {
        if (action.clearInitOffset) {
          fw.initOffsets.delete(action.target);
        }
        if (action.kind === 'partial') {
          partialReads.push(
            readBoundedTimelineEntries({
              filePath: fw.jsonlPath,
              from: action.from,
              to: action.to,
              provider: fw.provider,
            })
              .then((entries) => {
                if (entries.length > 0 && options.canSend(action.target)) {
                  const partialMsg: TTimelineServerMessage = { type: 'timeline:append', entries };
                  action.target.send(JSON.stringify(partialMsg));
                }
              })
              .catch(() => {}),
          );
          continue;
        }
        action.target.send(str);
      }

      if (partialReads.length > 0) {
        await Promise.all(partialReads);
      }
      options.onLiveShadowAppend(fw.jsonlPath, newEntries);

      const lastMsg = findLastTimelineUserMessage(newEntries);
      if (lastMsg) {
        await options.onLastUserMessage(fw.sessionName, lastMsg);
      }

      if (!fw.summaryResolved && newEntries.some((e) => e.type === 'assistant-message')) {
        fw.summaryResolved = true;
        const summary = await options.resolveAgentSummary(fw.provider, fw.sessionName, undefined);
        if (summary) {
          await options.onAgentSummary(fw.sessionName, fw.provider, summary);
        }
      }
    } finally {
      recordPerfDuration('timeline.process_file_change', getPerfNow() - startedAt);
      fw.processing = false;
      if (fw.pendingChange) {
        fw.pendingChange = false;
        void processFileChange(fw);
      }
    }
  };

  const startFileWatch = (fw: IFileWatcher): void => {
    try {
      fw.watcher = watchFile(fw.jsonlPath, () => {
        if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
        fw.debounceTimer = setTimeout(() => {
          void processFileChange(fw);
        }, options.debounceMs);
      });

      fw.watcher.on('error', () => {
        if (fw.retryCount < options.maxWatcherRetries) {
          fw.retryCount++;
          if (fw.watcher) fw.watcher.close();
          fw.watcher = null;
          setTimeout(() => startFileWatch(fw), retryDelayMs);
          return;
        }
        options.broadcastWatcher(fw.jsonlPath, {
          type: 'timeline:error',
          code: 'watcher-failed',
          message: 'File watch failed (retries exceeded)',
        });
      });
    } catch {
      // File may not exist yet; the caller will retry through normal session detection.
    }
  };

  const removeFileWatcher = (jsonlPath: string): void => {
    const fw = options.fileWatchers.get(jsonlPath);
    if (!fw) return;
    if (fw.watcher) fw.watcher.close();
    if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
    options.fileWatchers.delete(jsonlPath);
    void options.stopLiveShadow(jsonlPath);
  };

  return {
    processFileChange,
    startFileWatch,
    removeFileWatcher,
  };
};
