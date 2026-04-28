import fs from 'fs/promises';
import type { ICurrentAction } from '@/types/status';
import type { ITimelineEntry, ITimelineToolCall } from '@/types/timeline';
import { parseCodexJsonlContent } from '@/lib/codex-session-parser';

const READ_TAIL_BYTES = 256_000;
const MAX_SNIPPET_LENGTH = 200;
const STALE_MS_AWAITING_AGENT = 90_000;

export interface ICodexJsonlState {
  idle: boolean;
  stale: boolean;
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
  lastEntryTs: number | null;
  interrupted: boolean;
}

const EMPTY_STATE: ICodexJsonlState = {
  idle: false,
  stale: false,
  lastAssistantSnippet: null,
  currentAction: null,
  reset: false,
  lastEntryTs: null,
  interrupted: false,
};

const truncate = (value: string): string =>
  value.length > MAX_SNIPPET_LENGTH ? `${value.slice(0, MAX_SNIPPET_LENGTH)}...` : value;

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

    const entries = parseCodexJsonlContent(content);
    if (entries.length === 0) {
      return {
        ...EMPTY_STATE,
        stale: Date.now() - mtimeMs > STALE_MS_AWAITING_AGENT,
      };
    }

    const lastEntry = entries[entries.length - 1];
    const lastEntryTs = lastEntry.timestamp || null;
    const lastAssistantIdx = latestIndex(entries, (entry) => entry.type === 'assistant-message');
    const lastUserIdx = latestIndex(entries, (entry) => entry.type === 'user-message');
    const pendingToolIdx = latestIndex(entries, isPendingToolCall);
    const lastAssistant = lastAssistantIdx >= 0 ? entries[lastAssistantIdx] : null;
    const lastAssistantSnippet = lastAssistant?.type === 'assistant-message'
      ? truncate(lastAssistant.markdown.trim())
      : null;

    const pendingTool = pendingToolIdx > lastAssistantIdx && pendingToolIdx > lastUserIdx
      ? entries[pendingToolIdx]
      : null;
    if (pendingTool && pendingTool.type === 'tool-call') {
      return {
        idle: false,
        stale: Date.now() - mtimeMs > STALE_MS_AWAITING_AGENT,
        lastAssistantSnippet,
        currentAction: currentActionFromTool(pendingTool),
        reset: false,
        lastEntryTs,
        interrupted: false,
      };
    }

    if (lastUserIdx > lastAssistantIdx) {
      return {
        idle: false,
        stale: Date.now() - mtimeMs > STALE_MS_AWAITING_AGENT,
        lastAssistantSnippet: null,
        currentAction: null,
        reset: true,
        lastEntryTs,
        interrupted: false,
      };
    }

    if (lastAssistantSnippet) {
      return {
        idle: true,
        stale: false,
        lastAssistantSnippet,
        currentAction: {
          toolName: null,
          summary: lastAssistantSnippet,
        },
        reset: false,
        lastEntryTs,
        interrupted: false,
      };
    }

    return {
      ...EMPTY_STATE,
      stale: Date.now() - mtimeMs > STALE_MS_AWAITING_AGENT,
      lastEntryTs,
    };
  } catch {
    return EMPTY_STATE;
  }
};
