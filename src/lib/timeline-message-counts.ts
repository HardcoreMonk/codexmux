import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export interface IMessageCountResult {
  userCount: number;
  assistantCount: number;
  toolCount: number;
  toolBreakdown: Record<string, number>;
}

interface ILegacyRawEntry {
  type?: string;
  uuid?: string;
  requestId?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: {
    content?: unknown;
  };
}

interface ICodexRolloutRecord {
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

const MESSAGE_PAIR_DEDUPE_WINDOW_MS = 1_000;

export const emptyMessageCounts = (): IMessageCountResult => ({
  userCount: 0,
  assistantCount: 0,
  toolCount: 0,
  toolBreakdown: {},
});

const toTimestamp = (value: unknown): number => {
  if (typeof value !== 'string') return Date.now();
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
};

const extractTextItems = (content: unknown): string[] => {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];

  const result: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const text = (item as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim()) result.push(text);
  }
  return result;
};

const isImageWrapperText = (text: string): boolean => {
  const trimmed = text.trim();
  return /^<image(?:\s|>|$)/.test(trimmed) || trimmed === '</image>';
};

const isSyntheticUserContext = (text: string): boolean => {
  const trimmed = text.trimStart();
  return trimmed.startsWith('<environment_context>')
    || trimmed.startsWith('# AGENTS.md instructions for ');
};

const extractCodexUserText = (content: unknown): string =>
  extractTextItems(content)
    .filter((text) => !isImageWrapperText(text))
    .join('\n\n')
    .trim();

const extractCodexAssistantText = (content: unknown): string =>
  extractTextItems(content).join('\n\n').trim();

const getMessageKey = (role: 'user' | 'assistant', text: string): string =>
  `${role}:${text.replace(/\r\n/g, '\n').trim()}`;

const shouldCountCodexMessage = (
  seenMessages: Map<string, number>,
  role: 'user' | 'assistant',
  text: string,
  timestamp: number,
): boolean => {
  if (!text) return false;
  if (role === 'user' && isSyntheticUserContext(text)) return false;

  const key = getMessageKey(role, text);
  const seenAt = seenMessages.get(key);
  if (seenAt !== undefined && Math.abs(timestamp - seenAt) <= MESSAGE_PAIR_DEDUPE_WINDOW_MS) {
    return false;
  }
  seenMessages.set(key, timestamp);
  return true;
};

const isRealLegacyUserMessage = (entry: ILegacyRawEntry): boolean => {
  const content = entry.message?.content;
  if (typeof content === 'string') return content.length > 0;
  if (Array.isArray(content)) {
    return content.some((item) => {
      if (typeof item !== 'object' || item === null) return false;
      return (item as { type?: string }).type !== 'tool_result';
    });
  }
  return false;
};

const countLegacyToolUses = (
  content: unknown,
  counts: IMessageCountResult,
): void => {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue;
    const block = item as { type?: string; name?: string };
    if (block.type !== 'tool_use') continue;
    counts.toolCount++;
    const name = block.name?.trim() || 'tool';
    counts.toolBreakdown[name] = (counts.toolBreakdown[name] ?? 0) + 1;
  }
};

const countCodexRecord = (
  record: ICodexRolloutRecord,
  counts: IMessageCountResult,
  seenMessages: Map<string, number>,
): void => {
  const payload = record.payload;
  if (!payload || typeof payload !== 'object') return;
  const timestamp = toTimestamp(record.timestamp);

  if (record.type === 'event_msg') {
    if (payload.type === 'user_message') {
      const text = typeof payload.message === 'string' ? payload.message.trim() : '';
      if (shouldCountCodexMessage(seenMessages, 'user', text, timestamp)) counts.userCount++;
    } else if (payload.type === 'agent_message') {
      const text = typeof payload.message === 'string' ? payload.message.trim() : '';
      if (shouldCountCodexMessage(seenMessages, 'assistant', text, timestamp)) counts.assistantCount++;
    }
    return;
  }

  if (record.type !== 'response_item') return;

  if (payload.type === 'message' && payload.role === 'user') {
    const text = extractCodexUserText(payload.content);
    if (shouldCountCodexMessage(seenMessages, 'user', text, timestamp)) counts.userCount++;
  } else if (payload.type === 'message' && payload.role === 'assistant') {
    const text = extractCodexAssistantText(payload.content);
    if (shouldCountCodexMessage(seenMessages, 'assistant', text, timestamp)) counts.assistantCount++;
  } else if (payload.type === 'function_call') {
    counts.toolCount++;
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'tool';
    counts.toolBreakdown[name] = (counts.toolBreakdown[name] ?? 0) + 1;
  }
};

const countLegacyRecord = (
  record: ILegacyRawEntry,
  counts: IMessageCountResult,
  legacyAssistantIds: Set<string>,
): void => {
  if (record.isMeta === true || record.isSidechain === true) return;

  if (record.type === 'assistant') {
    const id = record.requestId ?? record.uuid;
    if (id && !legacyAssistantIds.has(id)) {
      legacyAssistantIds.add(id);
      counts.assistantCount++;
    } else if (!id) {
      counts.assistantCount++;
    }
    countLegacyToolUses(record.message?.content, counts);
  } else if (record.type === 'user' && isRealLegacyUserMessage(record)) {
    counts.userCount++;
  }
};

export const countTimelineMessages = async (filePath: string): Promise<IMessageCountResult> => {
  const counts = emptyMessageCounts();
  const seenCodexMessages = new Map<string, number>();
  const legacyAssistantIds = new Set<string>();
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let record: ICodexRolloutRecord & ILegacyRawEntry;
      try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
        record = parsed as ICodexRolloutRecord & ILegacyRawEntry;
      } catch {
        continue;
      }

      if (record.type === 'event_msg' || record.type === 'response_item') {
        countCodexRecord(record, counts, seenCodexMessages);
      } else {
        countLegacyRecord(record, counts, legacyAssistantIds);
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return counts;
};
