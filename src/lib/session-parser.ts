import fs from 'fs/promises';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type {
  ITimelineEntry,
  ITimelineUserMessage,
  ITimelineAssistantMessage,
  ITimelineToolCall,
  ITimelineToolResult,
  ITimelineDiff,
  TToolStatus,
} from '@/types/timeline';

const EXCLUDED_TYPES = new Set([
  'progress', 'system', 'file-history-snapshot',
  'queue-operation', 'summary', 'custom-title', 'agent-name',
]);

const BaseEntrySchema = z.object({
  uuid: z.string().optional(),
  parentUuid: z.string().optional(),
  timestamp: z.string().optional(),
  sessionId: z.string().optional(),
  cwd: z.string().optional(),
  isSidechain: z.boolean().optional(),
  type: z.string(),
});

const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
});

const ThinkingContentSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string().optional(),
});

const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.unknown().optional(),
  is_error: z.boolean().optional(),
});

const AssistantContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ToolUseContentSchema,
  ThinkingContentSchema,
]);

const UserContentSchema = z.union([
  TextContentSchema,
  ToolResultContentSchema,
  z.object({ type: z.string() }).passthrough(),
]);

const AssistantEntrySchema = BaseEntrySchema.extend({
  type: z.literal('assistant'),
  message: z.object({
    content: z.array(z.union([AssistantContentSchema, z.object({ type: z.string() }).passthrough()])),
  }),
});

const UserEntrySchema = BaseEntrySchema.extend({
  type: z.literal('user'),
  message: z.object({
    content: z.array(UserContentSchema),
  }),
});

const summarizeToolInput = (toolName: string, input: Record<string, unknown> = {}): {
  summary: string;
  filePath?: string;
  diff?: ITimelineDiff;
} => {
  switch (toolName) {
    case 'Read': {
      const fp = String(input.file_path ?? input.path ?? '');
      return { summary: `Read ${fp}`, filePath: fp };
    }
    case 'Edit': {
      const fp = String(input.file_path ?? '');
      const oldStr = String(input.old_string ?? '');
      const newStr = String(input.new_string ?? '');
      const oldLines = oldStr.split('\n').length;
      const newLines = newStr.split('\n').length;
      const added = Math.max(0, newLines - oldLines);
      const removed = Math.max(0, oldLines - newLines);
      const diff: ITimelineDiff | undefined = (oldStr || newStr)
        ? { oldString: oldStr, newString: newStr }
        : undefined;
      return {
        summary: `Edit ${fp} (+${added + (newLines > 0 ? newLines : 0) - (oldLines > 0 ? oldLines : 0) > 0 ? newLines - oldLines : 0}, -${removed + (oldLines > 0 ? oldLines : 0) - (newLines > 0 ? newLines : 0) > 0 ? oldLines - newLines : 0})`.replace(/\+0, -0/, '+0, -0'),
        filePath: fp,
        diff,
      };
    }
    case 'Write': {
      const fp = String(input.file_path ?? '');
      return { summary: `Write ${fp}`, filePath: fp };
    }
    case 'Bash': {
      const cmd = String(input.command ?? '').split('\n')[0].slice(0, 80);
      return { summary: `$ ${cmd}` };
    }
    case 'Grep':
    case 'Glob': {
      const pattern = String(input.pattern ?? '');
      return { summary: `${toolName} "${pattern}"` };
    }
    default: {
      const firstKey = Object.keys(input)[0];
      const firstVal = firstKey ? String(input[firstKey]).slice(0, 60) : '';
      return { summary: `${toolName}${firstVal ? ` ${firstVal}` : ''}` };
    }
  }
};

const computeEditDiff = (input: Record<string, unknown> = {}): ITimelineDiff | undefined => {
  const oldStr = String(input.old_string ?? '');
  const newStr = String(input.new_string ?? '');
  if (!oldStr && !newStr) return undefined;
  return { oldString: oldStr, newString: newStr };
};

const computeEditSummary = (input: Record<string, unknown> = {}): string => {
  const fp = String(input.file_path ?? '');
  const oldStr = String(input.old_string ?? '');
  const newStr = String(input.new_string ?? '');
  const oldLines = oldStr ? oldStr.split('\n').length : 0;
  const newLines = newStr ? newStr.split('\n').length : 0;
  return `Edit ${fp} (+${newLines}, -${oldLines})`;
};

const parseSingleEntry = (raw: unknown): ITimelineEntry[] => {
  const base = BaseEntrySchema.safeParse(raw);
  if (!base.success) return [];

  const data = base.data;
  if (EXCLUDED_TYPES.has(data.type)) return [];

  const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();

  if (data.isSidechain) return [];

  if (data.type === 'assistant') {
    const parsed = AssistantEntrySchema.safeParse(raw);
    if (!parsed.success) return [];

    const entries: ITimelineEntry[] = [];
    for (const content of parsed.data.message.content) {
      if (content.type === 'text' && 'text' in content) {
        entries.push({
          id: nanoid(),
          type: 'assistant-message',
          timestamp,
          text: String((content as { text: string }).text),
        } satisfies ITimelineAssistantMessage);
      } else if (content.type === 'tool_use' && 'id' in content && 'name' in content) {
        const input = ('input' in content ? content.input : {}) as Record<string, unknown>;
        const toolName = (content as { name: string }).name;
        const toolUseId = (content as { id: string }).id;

        let summary: string;
        let filePath: string | undefined;
        let diff: ITimelineDiff | undefined;

        if (toolName === 'Edit') {
          summary = computeEditSummary(input);
          filePath = String(input.file_path ?? '');
          diff = computeEditDiff(input);
        } else {
          const result = summarizeToolInput(toolName, input);
          summary = result.summary;
          filePath = result.filePath;
          diff = result.diff;
        }

        entries.push({
          id: nanoid(),
          type: 'tool-call',
          timestamp,
          toolUseId,
          toolName,
          summary,
          filePath,
          diff,
          status: 'pending' as TToolStatus,
        } satisfies ITimelineToolCall);
      }
    }
    return entries;
  }

  if (data.type === 'user') {
    const parsed = UserEntrySchema.safeParse(raw);
    if (!parsed.success) return [];

    const entries: ITimelineEntry[] = [];
    for (const content of parsed.data.message.content) {
      if (content.type === 'text' && 'text' in content) {
        entries.push({
          id: nanoid(),
          type: 'user-message',
          timestamp,
          text: (content as { text: string }).text,
        } satisfies ITimelineUserMessage);
      } else if (content.type === 'tool_result' && 'tool_use_id' in content) {
        const c = content as { tool_use_id: string; is_error?: boolean; content?: unknown };
        let summaryText = '';
        if (typeof c.content === 'string') {
          const lines = c.content.split('\n');
          summaryText = lines.length > 1 ? `${lines.length}줄 출력` : lines[0].slice(0, 100);
        } else if (Array.isArray(c.content)) {
          const textItems = c.content.filter((item: unknown) =>
            typeof item === 'object' && item !== null && (item as Record<string, unknown>).type === 'text',
          );
          if (textItems.length > 0) {
            const text = String((textItems[0] as Record<string, unknown>).text ?? '');
            const lines = text.split('\n');
            summaryText = lines.length > 1 ? `${lines.length}줄 출력` : lines[0].slice(0, 100);
          }
        }

        entries.push({
          id: nanoid(),
          type: 'tool-result',
          timestamp,
          toolUseId: c.tool_use_id,
          isError: c.is_error ?? false,
          summary: summaryText,
        } satisfies ITimelineToolResult);
      }
    }
    return entries;
  }

  return [];
};

export const parseJsonlContent = (content: string): ITimelineEntry[] => {
  const lines = content.split('\n').filter((line) => line.trim());
  const entries: ITimelineEntry[] = [];

  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      const parsed = parseSingleEntry(raw);
      entries.push(...parsed);
    } catch {
      // graceful: skip invalid lines
    }
  }

  return mergeToolResults(entries);
};

const mergeToolResults = (entries: ITimelineEntry[]): ITimelineEntry[] => {
  const toolCallMap = new Map<string, ITimelineToolCall>();
  const result: ITimelineEntry[] = [];

  for (const entry of entries) {
    if (entry.type === 'tool-call') {
      toolCallMap.set(entry.toolUseId, entry);
      result.push(entry);
    } else if (entry.type === 'tool-result') {
      const toolCall = toolCallMap.get(entry.toolUseId);
      if (toolCall) {
        toolCall.status = entry.isError ? 'error' : 'success';
      }
      result.push(entry);
    } else {
      result.push(entry);
    }
  }

  return result;
};

export const parseJsonlFile = async (filePath: string): Promise<ITimelineEntry[]> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseJsonlContent(content);
  } catch {
    return [];
  }
};

export const parseJsonlIncremental = async (
  filePath: string,
  fromOffset: number,
): Promise<{ entries: ITimelineEntry[]; newOffset: number }> => {
  try {
    const handle = await fs.open(filePath, 'r');
    const stat = await handle.stat();
    const size = stat.size;

    if (fromOffset >= size) {
      await handle.close();
      return { entries: [], newOffset: fromOffset };
    }

    const buffer = Buffer.alloc(size - fromOffset);
    await handle.read(buffer, 0, buffer.length, fromOffset);
    await handle.close();

    const content = buffer.toString('utf-8');
    const entries = parseJsonlContent(content);
    return { entries, newOffset: size };
  } catch {
    return { entries: [], newOffset: fromOffset };
  }
};

export const countJsonlEntries = async (filePath: string): Promise<number> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
};
