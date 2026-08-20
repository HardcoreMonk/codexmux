import type {
  IChunkReadResult,
  IIncrementalResult,
  ITimelineEntry,
  ITimelineUserMessage,
  ITimelineAssistantMessage,
  ITimelineThinking,
  ITimelineToolCall,
  ITimelineToolResult,
  ITimelineExecCommand,
  ITimelineWebSearch,
  ITimelineMcpCall,
  ITimelinePatchApply,
  ITimelineErrorNotice,
  ITimelineContextCompacted,
  ITimelinePatchFile,
  TToolStatus,
} from '@/types/timeline';
import fs from 'fs/promises';
import { createTimelineEntryId } from '@/lib/timeline-entry-id';
import { buildTimelineRichDetails } from '@/lib/timeline-preview';

interface ICodexRolloutRecord {
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

interface ICodexParseResult {
  entries: ITimelineEntry[];
  entryLineOffsets: number[];
  lastOffset: number;
  errorCount: number;
  summary?: string;
}

const toTimestamp = (value: unknown): number => {
  if (typeof value !== 'string') return Date.now();
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
};

const tryParseJson = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const truncate = (value: string, max = 120): string =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const safeString = (value: unknown): string => typeof value === 'string' ? value : '';

const safeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const MESSAGE_PAIR_DEDUPE_WINDOW_MS = 1_000;

const extractTextItems = (content: unknown): string[] => {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];

  const result: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    const text = block.text;
    if (typeof text === 'string' && text.trim()) result.push(text);
  }
  return result;
};

const isImageWrapperText = (text: string): boolean => {
  const trimmed = text.trim();
  return /^<image(?:\s|>|$)/.test(trimmed) || trimmed === '</image>';
};

const extractUserTextItems = (content: unknown): string[] =>
  extractTextItems(content).filter((text) => !isImageWrapperText(text));

const isSyntheticUserContext = (text: string): boolean => {
  const trimmed = text.trimStart();
  return trimmed.startsWith('<environment_context>')
    || trimmed.startsWith('# AGENTS.md instructions for ');
};

const summarizeCodexToolCall = (name: string, input: Record<string, unknown>): string => {
  switch (name) {
    case 'exec_command': {
      const cmd = String(input.cmd ?? '').split('\n')[0];
      return cmd ? `$ ${cmd}` : 'Execute command';
    }
    case 'write_stdin': {
      const sessionId = input.session_id;
      return sessionId === undefined ? 'Write stdin' : `Write stdin ${sessionId}`;
    }
    default: {
      const firstKey = Object.keys(input)[0];
      const firstVal = firstKey ? String(input[firstKey]).split('\n')[0] : '';
      return truncate(`${name}${firstVal ? ` ${firstVal}` : ''}`);
    }
  }
};

const parseMessage = (
  payload: Record<string, unknown>,
  timestamp: number,
): ITimelineUserMessage | ITimelineAssistantMessage | null => {
  const role = payload.role;
  if (role !== 'user' && role !== 'assistant') return null;
  const textItems = role === 'user'
    ? extractUserTextItems(payload.content)
    : extractTextItems(payload.content);
  const text = textItems.join('\n\n').trim();
  if (!text) return null;
  if (role === 'user' && isSyntheticUserContext(text)) return null;

  if (role === 'user') {
    return {
      id: '',
      type: 'user-message',
      timestamp,
      text,
    };
  }

  return {
    id: '',
    type: 'assistant-message',
    timestamp,
    markdown: text,
  };
};

const parseEventMessage = (
  payload: Record<string, unknown>,
  timestamp: number,
): ITimelineUserMessage | ITimelineAssistantMessage | null => {
  if (payload.type === 'user_message') {
    const text = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!text) return null;
    return {
      id: '',
      type: 'user-message',
      timestamp,
      text,
    };
  }

  if (payload.type === 'agent_message') {
    const text = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!text) return null;
    return {
      id: '',
      type: 'assistant-message',
      timestamp,
      markdown: text,
    };
  }

  return null;
};

const getMessageText = (entry: ITimelineUserMessage | ITimelineAssistantMessage): string =>
  entry.type === 'user-message' ? entry.text : entry.markdown;

const getMessageDedupeKey = (entry: ITimelineUserMessage | ITimelineAssistantMessage): string =>
  [entry.type, getMessageText(entry).replace(/\r\n/g, '\n').trim()].join(':');

const hasRecentMessage = (
  seenMessages: Map<string, number>,
  entry: ITimelineUserMessage | ITimelineAssistantMessage,
  timestamp: number,
): boolean => {
  const key = getMessageDedupeKey(entry);
  const seenAt = seenMessages.get(key);
  if (seenAt !== undefined && Math.abs(timestamp - seenAt) <= MESSAGE_PAIR_DEDUPE_WINDOW_MS) {
    return true;
  }
  seenMessages.set(key, timestamp);
  return false;
};

const parseReasoning = (
  payload: Record<string, unknown>,
  timestamp: number,
): ITimelineThinking | null => {
  if (payload.type !== 'reasoning') return null;
  const visible: string[] = [];
  if (Array.isArray(payload.summary)) {
    visible.push(...payload.summary.filter((v): v is string => typeof v === 'string' && !!v.trim()));
  }
  if (Array.isArray(payload.content)) {
    visible.push(...payload.content.filter((v): v is string => typeof v === 'string' && !!v.trim()));
  } else if (typeof payload.content === 'string' && payload.content.trim()) {
    visible.push(payload.content);
  }

  const thinking = visible.join('\n\n').trim();
  if (!thinking) return null;
  return {
    id: '',
    type: 'thinking',
    timestamp,
    thinking,
  };
};

const parseToolCall = (
  payload: Record<string, unknown>,
  timestamp: number,
): ITimelineToolCall | null => {
  if (payload.type !== 'function_call') return null;
  const name = typeof payload.name === 'string' ? payload.name : 'tool';
  const callId = typeof payload.call_id === 'string' ? payload.call_id : `missing-call-${timestamp}`;
  const input = tryParseJson(payload.arguments);
  return {
    id: '',
    type: 'tool-call',
    timestamp,
    toolUseId: callId,
    toolName: name,
    summary: summarizeCodexToolCall(name, input),
    status: 'pending',
  };
};

const parseToolResult = (
  payload: Record<string, unknown>,
  timestamp: number,
): ITimelineToolResult | null => {
  if (payload.type !== 'function_call_output') return null;
  const callId = typeof payload.call_id === 'string' ? payload.call_id : `missing-output-${timestamp}`;
  const output = typeof payload.output === 'string' ? payload.output : '';
  const isError = /status:\s*failed|Process exited with code [1-9]/i.test(output);
  const lines = output.split('\n').filter((line) => line.trim());
  const summary = lines.length > 1 ? `${lines.length} lines` : truncate(lines[0] ?? '');
  return {
    id: '',
    type: 'tool-result',
    timestamp,
    toolUseId: callId,
    isError,
    summary,
  };
};

interface IExecAccumulator {
  kind: 'exec';
  command: string;
  cwd?: string;
  output: string;
  truncated: boolean;
}

interface IWebAccumulator {
  kind: 'web';
  query?: string;
}

interface IMcpAccumulator {
  kind: 'mcp';
  server: string;
  tool: string;
  arguments?: unknown;
}

interface IPatchAccumulator {
  kind: 'patch';
  files: ITimelinePatchFile[];
}

type TRichAccumulator = IExecAccumulator | IWebAccumulator | IMcpAccumulator | IPatchAccumulator;

const MAX_ACCUMULATED_OUTPUT_BYTES = 16 * 1024;

const appendExecOutput = (entry: IExecAccumulator, chunk: string): void => {
  if (entry.truncated || !chunk) return;
  const currentBytes = Buffer.byteLength(entry.output, 'utf-8');
  const remaining = MAX_ACCUMULATED_OUTPUT_BYTES - currentBytes;
  if (remaining <= 0) {
    entry.truncated = true;
    return;
  }
  const candidate = Buffer.from(chunk, 'utf-8');
  if (candidate.byteLength <= remaining) {
    entry.output += chunk;
    return;
  }
  entry.output += candidate.subarray(0, remaining).toString('utf-8').replace(/�$/, '');
  entry.truncated = true;
};

const readCommand = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(' ');
  return '';
};

const parseDurationMs = (value: unknown): number | undefined => {
  const duration = asRecord(value);
  if (!duration) return safeNumber(value);
  const seconds = safeNumber(duration.secs) ?? safeNumber(duration.seconds) ?? 0;
  const nanos = safeNumber(duration.nanos) ?? safeNumber(duration.nanoseconds) ?? 0;
  return Math.round(seconds * 1000 + nanos / 1_000_000);
};

const parsePatchFiles = (input: string): ITimelinePatchFile[] => {
  const files: ITimelinePatchFile[] = [];
  const header = /^\*\*\*\s+(Add|Update|Delete)\s+File:\s+(.+?)\s*$/i;
  for (const line of input.split('\n')) {
    const match = line.match(header);
    if (!match) continue;
    files.push({
      path: match[2],
      operation: match[1].toLowerCase() as 'add' | 'update' | 'delete',
    });
  }
  return files;
};

const parseResponseRichEntry = (
  payload: Record<string, unknown>,
  timestamp: number,
): ITimelineWebSearch | ITimelinePatchApply | null => {
  if (payload.type === 'web_search_call') {
    const rawStatus = safeString(payload.status);
    return {
      id: '',
      type: 'web-search',
      timestamp,
      callId: safeString(payload.call_id) || `web-${timestamp}`,
      query: safeString(payload.query) || undefined,
      status: rawStatus === 'failed' ? 'error' : rawStatus === 'completed' ? 'success' : 'pending',
      details: buildTimelineRichDetails({ results: payload.results }),
    };
  }

  if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch') {
    const input = safeString(payload.input);
    const rawStatus = safeString(payload.status);
    return {
      id: '',
      type: 'patch-apply',
      timestamp,
      callId: safeString(payload.call_id) || `patch-${timestamp}`,
      files: parsePatchFiles(input),
      status: rawStatus === 'failed' ? 'error' : rawStatus === 'completed' ? 'success' : 'pending',
      details: buildTimelineRichDetails({ patch: input }),
    };
  }

  return null;
};

const parseRichEvent = (
  payload: Record<string, unknown>,
  timestamp: number,
  accumulators: Map<string, TRichAccumulator>,
): ITimelineEntry | null => {
  const type = safeString(payload.type);
  const callId = safeString(payload.call_id);

  if (type === 'error' || type === 'warning' || type === 'stream_error') {
    const severity = type === 'stream_error' ? 'stream-error' : type;
    return {
      id: '',
      type: 'error-notice',
      timestamp,
      severity,
      message: safeString(payload.message) || type,
      details: buildTimelineRichDetails({
        retryStatus: payload.retry_status,
        errorCode: payload.codex_error_info,
      }),
    } satisfies ITimelineErrorNotice;
  }

  if (type === 'context_compacted') {
    return {
      id: '',
      type: 'context-compacted',
      timestamp,
      beforeTokens: safeNumber(payload.before_tokens),
      afterTokens: safeNumber(payload.after_tokens),
    } satisfies ITimelineContextCompacted;
  }

  if (type === 'exec_command_begin' && callId) {
    accumulators.set(callId, {
      kind: 'exec',
      command: readCommand(payload.command),
      cwd: safeString(payload.cwd) || undefined,
      output: '',
      truncated: false,
    });
    return null;
  }

  if (type === 'exec_command_delta' && callId) {
    const existing = accumulators.get(callId);
    if (existing?.kind === 'exec') appendExecOutput(existing, safeString(payload.chunk ?? payload.data));
    return null;
  }

  if (type === 'exec_command_end' && callId) {
    const existing = accumulators.get(callId);
    const exec = existing?.kind === 'exec' ? existing : {
      kind: 'exec' as const,
      command: readCommand(payload.command),
      cwd: safeString(payload.cwd) || undefined,
      output: '',
      truncated: false,
    };
    if (!exec.output) appendExecOutput(exec, safeString(payload.aggregated_output ?? payload.stdout));
    accumulators.delete(callId);
    const exitCode = safeNumber(payload.exit_code);
    const details = buildTimelineRichDetails({ output: exec.output, stderr: payload.stderr });
    if (details && exec.truncated) details.truncated = true;
    return {
      id: '',
      type: 'exec-command',
      timestamp,
      callId,
      command: exec.command,
      cwd: exec.cwd,
      exitCode,
      durationMs: parseDurationMs(payload.duration),
      status: exitCode === 0 ? 'success' : 'error',
      details,
    } satisfies ITimelineExecCommand;
  }

  if (type === 'web_search_begin' && callId) {
    accumulators.set(callId, { kind: 'web', query: safeString(payload.query) || undefined });
    return null;
  }

  if (type === 'web_search_end' && callId) {
    const existing = accumulators.get(callId);
    const results = Array.isArray(payload.results) ? payload.results : [];
    accumulators.delete(callId);
    return {
      id: '',
      type: 'web-search',
      timestamp,
      callId,
      query: existing?.kind === 'web' ? existing.query : safeString(payload.query) || undefined,
      resultCount: results.length || undefined,
      status: 'success',
      details: buildTimelineRichDetails({ summary: payload.summary, results }),
    } satisfies ITimelineWebSearch;
  }

  if (type === 'mcp_tool_call_begin' && callId) {
    accumulators.set(callId, {
      kind: 'mcp',
      server: safeString(payload.server),
      tool: safeString(payload.tool),
      arguments: payload.arguments,
    });
    return null;
  }

  if (type === 'mcp_tool_call_end' && callId) {
    const existing = accumulators.get(callId);
    accumulators.delete(callId);
    return {
      id: '',
      type: 'mcp-call',
      timestamp,
      callId,
      server: existing?.kind === 'mcp' ? existing.server : safeString(payload.server),
      tool: existing?.kind === 'mcp' ? existing.tool : safeString(payload.tool),
      status: payload.success === false || payload.error ? 'error' : 'success',
      details: buildTimelineRichDetails({
        arguments: existing?.kind === 'mcp' ? existing.arguments : payload.arguments,
        result: payload.result,
        error: payload.error,
      }),
    } satisfies ITimelineMcpCall;
  }

  if (type === 'patch_apply_begin' && callId) {
    accumulators.set(callId, { kind: 'patch', files: [] });
    return null;
  }

  if (type === 'patch_apply_updated' && callId) {
    const existing = accumulators.get(callId);
    const path = safeString(payload.path);
    if (existing?.kind === 'patch' && path) {
      const operation = safeString(payload.status).toLowerCase();
      existing.files.push({
        path,
        operation: operation === 'add' || operation === 'update' || operation === 'delete'
          ? operation
          : 'unknown',
      });
    }
    return null;
  }

  if (type === 'patch_apply_end' && callId) {
    const existing = accumulators.get(callId);
    accumulators.delete(callId);
    return {
      id: '',
      type: 'patch-apply',
      timestamp,
      callId,
      files: existing?.kind === 'patch' ? existing.files : [],
      status: payload.success === false ? 'error' : 'success',
      details: buildTimelineRichDetails({ error: payload.error }),
    } satisfies ITimelinePatchApply;
  }

  return null;
};

const updateToolStatuses = (entries: ITimelineEntry[]): ITimelineEntry[] => {
  const semanticCallIds = new Set(entries.flatMap((entry) => {
    if (entry.type === 'exec-command' || entry.type === 'web-search'
      || entry.type === 'mcp-call' || entry.type === 'patch-apply') {
      return [entry.callId];
    }
    return [];
  }));
  const filtered = entries.filter((entry) => (
    (entry.type !== 'tool-call' && entry.type !== 'tool-result')
    || !semanticCallIds.has(entry.toolUseId)
  ));
  const finalStatus = new Map<string, TToolStatus>();
  for (const entry of filtered) {
    if (entry.type === 'tool-result') {
      finalStatus.set(entry.toolUseId, entry.isError ? 'error' : 'success');
    }
  }
  return filtered.map((entry) => {
    if (entry.type !== 'tool-call') return entry;
    const status = finalStatus.get(entry.toolUseId);
    return status ? { ...entry, status } : entry;
  });
};

const parseCodexContent = (content: string, baseOffset = 0): ICodexParseResult => {
  const entries: ITimelineEntry[] = [];
  const entryLineOffsets: number[] = [];
  const seenMessages = new Map<string, number>();
  const richAccumulators = new Map<string, TRichAccumulator>();
  let errorCount = 0;
  let summary: string | undefined;
  let bytePos = 0;

  for (const line of content.split('\n')) {
    const lineByteOffset = baseOffset + bytePos;
    bytePos += Buffer.byteLength(line, 'utf-8') + 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let lineEntryIndex = 0;
    const pushEntry = (entry: ITimelineEntry) => {
      entries.push({
        ...entry,
        id: createTimelineEntryId({
          lineOffset: lineByteOffset,
          entryIndex: lineEntryIndex,
          type: entry.type,
          source: trimmed,
        }),
      });
      entryLineOffsets.push(lineByteOffset);
      lineEntryIndex++;
    };

    let record: ICodexRolloutRecord;
    try {
      record = JSON.parse(trimmed) as ICodexRolloutRecord;
    } catch {
      errorCount++;
      continue;
    }

    const payload = record.payload;
    if (!payload || typeof payload !== 'object') continue;
    const timestamp = toTimestamp(record.timestamp);

    if (record.type === 'event_msg') {
      const richEntry = parseRichEvent(payload, timestamp, richAccumulators);
      if (richEntry) {
        pushEntry(richEntry);
        continue;
      }
      const message = parseEventMessage(payload, timestamp);
      if (message && !hasRecentMessage(seenMessages, message, timestamp)) {
        pushEntry(message);
        if (!summary && message.type === 'user-message') summary = truncate(message.text, 200);
      }
      continue;
    }

    if (record.type !== 'response_item') continue;

    const richEntry = parseResponseRichEntry(payload, timestamp);
    if (richEntry) {
      pushEntry(richEntry);
      continue;
    }

    const message = parseMessage(payload, timestamp);
    if (message) {
      if (!hasRecentMessage(seenMessages, message, timestamp)) {
        pushEntry(message);
        if (!summary && message.type === 'user-message') summary = truncate(message.text, 200);
      }
      continue;
    }

    const reasoning = parseReasoning(payload, timestamp);
    if (reasoning) {
      pushEntry(reasoning);
      continue;
    }

    const toolCall = parseToolCall(payload, timestamp);
    if (toolCall) {
      pushEntry(toolCall);
      continue;
    }

    const toolResult = parseToolResult(payload, timestamp);
    if (toolResult) {
      pushEntry(toolResult);
    }
  }

  return {
    entries: updateToolStatuses(entries),
    entryLineOffsets,
    lastOffset: Buffer.byteLength(content, 'utf-8'),
    errorCount,
    summary,
  };
};

export const parseCodexJsonlContent = (content: string): ITimelineEntry[] => {
  return parseCodexContent(content).entries;
};

const CHUNK_SIZE = 256_000;
const SMALL_FILE_THRESHOLD = CHUNK_SIZE;

const readChunk = async (
  filePath: string,
  from: number,
  to: number,
): Promise<{ content: string; validFrom: number }> => {
  const readSize = to - from;
  if (readSize <= 0) return { content: '', validFrom: from };
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(readSize);
    await handle.read(buffer, 0, readSize, from);
    const raw = buffer.toString('utf-8');
    if (from === 0) return { content: raw, validFrom: 0 };

    const firstNewline = raw.indexOf('\n');
    if (firstNewline < 0) return { content: '', validFrom: to };
    return {
      content: raw.slice(firstNewline + 1),
      validFrom: from + Buffer.byteLength(raw.slice(0, firstNewline + 1), 'utf-8'),
    };
  } finally {
    await handle.close();
  }
};

export const readCodexTailEntries = async (
  filePath: string,
  maxEntries: number,
): Promise<IChunkReadResult> => {
  const empty: IChunkReadResult = {
    entries: [],
    startByteOffset: 0,
    fileSize: 0,
    hasMore: false,
    errorCount: 0,
  };

  try {
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    if (fileSize === 0) return empty;

    if (fileSize <= SMALL_FILE_THRESHOLD) {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = parseCodexContent(content);
      const sliced = result.entries.length > maxEntries;
      const sliceStart = sliced ? result.entries.length - maxEntries : 0;
      return {
        entries: sliced ? result.entries.slice(-maxEntries) : result.entries,
        startByteOffset: sliced ? result.entryLineOffsets[sliceStart] : 0,
        fileSize,
        hasMore: sliced,
        errorCount: result.errorCount,
        summary: result.summary,
      };
    }

    let chunkSize = CHUNK_SIZE;
    while (chunkSize < fileSize * 2) {
      const from = Math.max(0, fileSize - chunkSize);
      const { content, validFrom } = await readChunk(filePath, from, fileSize);
      if (!content) {
        chunkSize *= 2;
        continue;
      }
      const result = parseCodexContent(content, validFrom);
      if (result.entries.length >= maxEntries || from === 0) {
        const sliced = result.entries.length > maxEntries;
        const sliceStart = sliced ? result.entries.length - maxEntries : 0;
        const startByteOffset = sliced
          ? validFrom + result.entryLineOffsets[sliceStart]
          : (from === 0 ? 0 : validFrom);
        return {
          entries: sliced ? result.entries.slice(-maxEntries) : result.entries,
          startByteOffset,
          fileSize,
          hasMore: startByteOffset > 0,
          errorCount: result.errorCount,
          summary: result.summary,
        };
      }
      chunkSize *= 2;
    }

    return empty;
  } catch {
    return empty;
  }
};

export const readCodexEntriesBefore = async (
  filePath: string,
  beforeByte: number,
  maxEntries: number,
): Promise<IChunkReadResult> => {
  const empty: IChunkReadResult = {
    entries: [],
    startByteOffset: 0,
    fileSize: 0,
    hasMore: false,
    errorCount: 0,
  };

  try {
    if (beforeByte <= 0) return empty;
    const stat = await fs.stat(filePath);

    let chunkSize = CHUNK_SIZE;
    while (true) {
      const from = Math.max(0, beforeByte - chunkSize);
      const { content, validFrom } = await readChunk(filePath, from, beforeByte);
      if (content) {
        const result = parseCodexContent(content, validFrom);
        if (result.entries.length >= maxEntries || from === 0) {
          const sliced = result.entries.length > maxEntries;
          const sliceStart = sliced ? result.entries.length - maxEntries : 0;
          const startByteOffset = sliced
            ? validFrom + result.entryLineOffsets[sliceStart]
            : (from === 0 ? 0 : validFrom);
          return {
            entries: sliced ? result.entries.slice(-maxEntries) : result.entries,
            startByteOffset,
            fileSize: stat.size,
            hasMore: startByteOffset > 0,
            errorCount: result.errorCount,
            summary: result.summary,
          };
        }
      }
      if (from === 0) return empty;
      chunkSize *= 2;
    }
  } catch {
    return empty;
  }
};

export const parseCodexIncremental = async (
  filePath: string,
  fromOffset: number,
  pendingBuffer = '',
): Promise<IIncrementalResult> => {
  try {
    const handle = await fs.open(filePath, 'r');
    const stat = await handle.stat();
    const size = stat.size;

    if (size < fromOffset) {
      await handle.close();
      const content = await fs.readFile(filePath, 'utf-8');
      const result = parseCodexContent(content);
      return { newEntries: result.entries, newOffset: size, pendingBuffer: '' };
    }

    if (fromOffset >= size) {
      await handle.close();
      return { newEntries: [], newOffset: fromOffset, pendingBuffer };
    }

    const buffer = Buffer.alloc(size - fromOffset);
    await handle.read(buffer, 0, buffer.length, fromOffset);
    await handle.close();

    const rawContent = pendingBuffer + buffer.toString('utf-8');
    const endsWithNewline = rawContent.endsWith('\n');
    const segments = rawContent.split('\n');
    let newPending = '';
    if (!endsWithNewline) {
      const lastSegment = segments.pop() ?? '';
      if (lastSegment) {
        try {
          JSON.parse(lastSegment);
          segments.push(lastSegment);
        } catch {
          newPending = lastSegment;
        }
      }
    }

    const contentBaseOffset = Math.max(0, fromOffset - Buffer.byteLength(pendingBuffer, 'utf-8'));
    const result = parseCodexContent(segments.join('\n'), contentBaseOffset);
    return {
      newEntries: result.entries,
      newOffset: size,
      pendingBuffer: newPending,
    };
  } catch {
    return { newEntries: [], newOffset: fromOffset, pendingBuffer };
  }
};
