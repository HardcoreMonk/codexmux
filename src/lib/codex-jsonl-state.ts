import fs from 'fs/promises';
import type { ICurrentAction } from '@/types/status';
import type { ITimelineEntry, ITimelineToolCall } from '@/types/timeline';
import { parseCodexJsonlContent } from '@/lib/codex-session-parser';

const READ_TAIL_BYTES = 256_000;
const MAX_SNIPPET_LENGTH = 200;
const STALE_MS_AWAITING_AGENT = 90_000;

interface ICodexRawRecord {
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

interface ITaskCompleteMarker {
  lineIndex: number;
  timestamp: number | null;
  snippet: string | null;
  turnId: string | null;
}

interface IInterruptMarker {
  lineIndex: number;
  timestamp: number | null;
}

interface ICodexRawMarkers {
  lastTaskComplete: ITaskCompleteMarker | null;
  lastInterrupt: IInterruptMarker | null;
  lastTurnActivityLineIndex: number;
  lastUserLineIndex: number;
  lastEntryTs: number | null;
}

export interface ICodexJsonlState {
  idle: boolean;
  stale: boolean;
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
  lastEntryTs: number | null;
  interrupted: boolean;
  completionTurnId: string | null;
}

const EMPTY_STATE: ICodexJsonlState = {
  idle: false,
  stale: false,
  lastAssistantSnippet: null,
  currentAction: null,
  reset: false,
  lastEntryTs: null,
  interrupted: false,
  completionTurnId: null,
};

const truncate = (value: string): string =>
  value.length > MAX_SNIPPET_LENGTH ? `${value.slice(0, MAX_SNIPPET_LENGTH)}...` : value;

const toTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
};

const payloadType = (record: ICodexRawRecord): string | null =>
  typeof record.payload?.type === 'string' ? record.payload.type : null;

const textStartsWithInterrupt = (value: unknown): boolean =>
  typeof value === 'string'
  && (
    value.trimStart().startsWith('<turn_aborted>')
    || value.startsWith('[Request interrupted by user')
  );

const recordContentHasInterrupt = (record: ICodexRawRecord): boolean => {
  const content = record.payload?.content;
  if (!Array.isArray(content)) return false;
  return content.some((item) => (
    item
    && typeof item === 'object'
    && textStartsWithInterrupt((item as { text?: unknown }).text)
  ));
};

const isInterruptRecord = (record: ICodexRawRecord): boolean => {
  if (record.type === 'event_msg' && payloadType(record) === 'turn_aborted') return true;
  if (textStartsWithInterrupt(record.payload?.message)) return true;
  return recordContentHasInterrupt(record);
};

const extractCompletionSnippet = (payload: Record<string, unknown>): string | null => {
  const lastAgentMessage = payload.last_agent_message;
  if (typeof lastAgentMessage === 'string' && lastAgentMessage.trim()) {
    return truncate(lastAgentMessage.trim());
  }

  const message = payload.message;
  if (typeof message === 'string' && message.trim()) {
    return truncate(message.trim());
  }

  return null;
};

const isUserActivity = (record: ICodexRawRecord): boolean => {
  if (record.type === 'event_msg' && payloadType(record) === 'user_message') return true;
  if (record.type === 'response_item' && record.payload?.role === 'user') return true;
  return record.type === 'user';
};

const isTurnActivity = (record: ICodexRawRecord): boolean => {
  if (isUserActivity(record)) return true;
  if (record.type === 'response_item') return true;
  if (record.type !== 'event_msg') return false;

  const type = payloadType(record);
  return type === 'task_started'
    || type === 'agent_message'
    || type === 'user_message';
};

const scanRawMarkers = (content: string): ICodexRawMarkers => {
  let lastTaskComplete: ITaskCompleteMarker | null = null;
  let lastInterrupt: IInterruptMarker | null = null;
  let lastTurnActivityLineIndex = -1;
  let lastUserLineIndex = -1;
  let lastEntryTs: number | null = null;

  const lines = content.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const trimmed = lines[lineIndex].trim();
    if (!trimmed) continue;

    let record: ICodexRawRecord;
    try {
      record = JSON.parse(trimmed) as ICodexRawRecord;
    } catch {
      continue;
    }

    const ts = toTimestamp(record.timestamp);
    if (ts !== null) lastEntryTs = ts;

    if (isInterruptRecord(record)) {
      lastInterrupt = { lineIndex, timestamp: ts };
    }

    if (isUserActivity(record)) {
      lastUserLineIndex = lineIndex;
    }

    if (record.type === 'event_msg' && payloadType(record) === 'task_complete') {
      lastTaskComplete = {
        lineIndex,
        timestamp: ts,
        snippet: record.payload ? extractCompletionSnippet(record.payload) : null,
        turnId: typeof record.payload?.turn_id === 'string' ? record.payload.turn_id : null,
      };
      continue;
    }

    if (isTurnActivity(record)) {
      lastTurnActivityLineIndex = lineIndex;
    }
  }

  return {
    lastTaskComplete,
    lastInterrupt,
    lastTurnActivityLineIndex,
    lastUserLineIndex,
    lastEntryTs,
  };
};

const readTail = async (filePath: string): Promise<{ content: string; mtimeMs: number }> => {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) return { content: '', mtimeMs: stat.mtimeMs };

  const readSize = Math.min(stat.size, READ_TAIL_BYTES);
  const from = stat.size - readSize;
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(readSize);
    await handle.read(buffer, 0, readSize, from);
    const raw = buffer.toString('utf-8');
    if (from === 0) return { content: raw, mtimeMs: stat.mtimeMs };

    const firstNewline = raw.indexOf('\n');
    return {
      content: firstNewline >= 0 ? raw.slice(firstNewline + 1) : '',
      mtimeMs: stat.mtimeMs,
    };
  } finally {
    await handle.close();
  }
};

const isPendingToolCall = (entry: ITimelineEntry): entry is ITimelineToolCall =>
  entry.type === 'tool-call' && entry.status === 'pending';

const latestIndex = (entries: ITimelineEntry[], predicate: (entry: ITimelineEntry) => boolean): number => {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (predicate(entries[i])) return i;
  }
  return -1;
};

const currentActionFromTool = (entry: ITimelineToolCall): ICurrentAction => ({
  toolName: entry.toolName,
  summary: entry.summary,
});

export const checkCodexJsonlState = async (filePath: string): Promise<ICodexJsonlState> => {
  try {
    const { content, mtimeMs } = await readTail(filePath);
    if (!content.trim()) return EMPTY_STATE;

    const stale = Date.now() - mtimeMs > STALE_MS_AWAITING_AGENT;
    const markers = scanRawMarkers(content);
    const entries = parseCodexJsonlContent(content);
    const taskComplete = markers.lastTaskComplete;
    const hasCurrentTaskComplete = taskComplete !== null
      && taskComplete.lineIndex > markers.lastUserLineIndex
      && taskComplete.lineIndex > markers.lastTurnActivityLineIndex;
    const hasCurrentInterrupt = markers.lastInterrupt !== null
      && markers.lastInterrupt.lineIndex >= markers.lastUserLineIndex
      && markers.lastInterrupt.lineIndex >= markers.lastTurnActivityLineIndex
      && (taskComplete === null || markers.lastInterrupt.lineIndex > taskComplete.lineIndex);

    if (hasCurrentInterrupt && markers.lastInterrupt) {
      return {
        idle: true,
        stale: false,
        lastAssistantSnippet: null,
        currentAction: null,
        reset: false,
        lastEntryTs: markers.lastInterrupt.timestamp ?? markers.lastEntryTs,
        interrupted: true,
        completionTurnId: null,
      };
    }

    if (entries.length === 0) {
      if (hasCurrentTaskComplete && taskComplete) {
        return {
          idle: true,
          stale: false,
          lastAssistantSnippet: taskComplete.snippet,
          currentAction: taskComplete.snippet
            ? {
                toolName: null,
                summary: taskComplete.snippet,
              }
            : null,
          reset: false,
          lastEntryTs: taskComplete.timestamp ?? markers.lastEntryTs,
          interrupted: false,
          completionTurnId: taskComplete.turnId,
        };
      }

      return {
        ...EMPTY_STATE,
        stale,
        lastEntryTs: markers.lastEntryTs,
      };
    }

    const lastEntry = entries[entries.length - 1];
    const lastEntryTs = markers.lastEntryTs ?? lastEntry.timestamp ?? null;
    const lastAssistantIdx = latestIndex(entries, (entry) => entry.type === 'assistant-message');
    const lastUserIdx = latestIndex(entries, (entry) => entry.type === 'user-message');
    const pendingToolIdx = latestIndex(entries, isPendingToolCall);
    const lastAssistant = lastAssistantIdx >= 0 ? entries[lastAssistantIdx] : null;
    const lastAssistantSnippet = lastAssistant?.type === 'assistant-message'
      ? truncate(lastAssistant.markdown.trim())
      : null;
    const completionSnippet = taskComplete?.snippet ?? lastAssistantSnippet;

    if (hasCurrentTaskComplete && taskComplete) {
      return {
        idle: true,
        stale: false,
        lastAssistantSnippet: completionSnippet,
        currentAction: completionSnippet
          ? {
              toolName: null,
              summary: completionSnippet,
            }
          : null,
        reset: false,
        lastEntryTs,
        interrupted: false,
        completionTurnId: taskComplete.turnId,
      };
    }

    const pendingTool = pendingToolIdx > lastAssistantIdx && pendingToolIdx > lastUserIdx
      ? entries[pendingToolIdx]
      : null;
    if (pendingTool && pendingTool.type === 'tool-call') {
      return {
        idle: false,
        stale,
        lastAssistantSnippet,
        currentAction: currentActionFromTool(pendingTool),
        reset: false,
        lastEntryTs,
        interrupted: false,
        completionTurnId: null,
      };
    }

    if (lastUserIdx > lastAssistantIdx) {
      return {
        idle: false,
        stale,
        lastAssistantSnippet: null,
        currentAction: null,
        reset: true,
        lastEntryTs,
        interrupted: false,
        completionTurnId: null,
      };
    }

    if (lastAssistantSnippet) {
      return {
        idle: false,
        stale,
        lastAssistantSnippet,
        currentAction: {
          toolName: null,
          summary: lastAssistantSnippet,
        },
        reset: false,
        lastEntryTs,
        interrupted: false,
        completionTurnId: null,
      };
    }

    return {
      ...EMPTY_STATE,
      stale,
      lastEntryTs,
    };
  } catch {
    return EMPTY_STATE;
  }
};
