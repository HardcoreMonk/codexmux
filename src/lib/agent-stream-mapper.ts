import type { IChatMessage, TAgentStatus } from '@/types/agent';

export type TAssistantContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

export type TUserContent =
  | { type: 'tool_result'; tool_use_id: string; is_error?: boolean; content: unknown }
  | { type: 'text'; text: string };

export type TClaudeStreamEvent =
  | {
      type: 'system';
      subtype: string;
      session_id?: string;
      attempt?: number;
      max_retries?: number;
      error?: string;
    }
  | { type: 'assistant'; message: { content: TAssistantContent[] } }
  | { type: 'user'; message: { content: TUserContent[] } }
  | {
      type: 'result';
      subtype: string;
      stop_reason?: string;
      result?: string;
      total_cost_usd?: number;
      num_turns?: number;
    }
  | { type: 'stream_event'; event: unknown };

export type TMapResult =
  | {
      kind: 'chat';
      role: 'agent';
      type: IChatMessage['type'];
      content: string;
      metadata?: Record<string, unknown>;
    }
  | { kind: 'status'; status: TAgentStatus }
  | { kind: 'drop' };

export interface IMapperState {
  initialized: boolean;
  deniedToolStreak: number;
  lastAssistantText: string | null;
}

export const createMapperState = (): IMapperState => ({
  initialized: false,
  deniedToolStreak: 0,
  lastAssistantText: null,
});

const DENY_STREAK_ERROR_THRESHOLD = 3;

const stringifyToolResultContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
};

const looksLikePermissionDenial = (text: string): boolean => {
  const lower = text.toLowerCase();
  return lower.includes('permission') || lower.includes('not allowed') || lower.includes('denied');
};

const summarizeBashCommand = (command: string): string => {
  const trimmed = command.trim().replace(/\s+/g, ' ');
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
};

const mapAssistantContent = (content: TAssistantContent[], state: IMapperState): TMapResult[] => {
  const out: TMapResult[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      const text = part.text.trim();
      if (!text) continue;
      if (state.lastAssistantText === text) {
        out.push({ kind: 'drop' });
        continue;
      }
      state.lastAssistantText = text;
      out.push({ kind: 'chat', role: 'agent', type: 'report', content: text });
    } else if (part.type === 'tool_use') {
      const { name, input, id } = part;
      let summary: string;
      if (name === 'Bash' && typeof input.command === 'string') {
        summary = `Running: ${summarizeBashCommand(input.command)}`;
      } else {
        summary = `Using ${name}`;
      }
      out.push({
        kind: 'chat',
        role: 'agent',
        type: 'activity',
        content: summary,
        metadata: { tool: name, toolUseId: id, input },
      });
    }
  }
  return out;
};

const mapUserContent = (content: TUserContent[], state: IMapperState): TMapResult[] => {
  const out: TMapResult[] = [];
  for (const part of content) {
    if (part.type !== 'tool_result') continue;

    const text = stringifyToolResultContent(part.content);
    const isError = part.is_error === true;

    if (isError && looksLikePermissionDenial(text)) {
      state.deniedToolStreak += 1;
      if (state.deniedToolStreak >= DENY_STREAK_ERROR_THRESHOLD) {
        state.deniedToolStreak = 0;
        out.push({
          kind: 'chat',
          role: 'agent',
          type: 'error',
          content: 'Repeated permission denials — check tool allowlist.',
          metadata: { reason: 'permission_denial_streak', toolUseId: part.tool_use_id },
        });
      } else {
        out.push({
          kind: 'chat',
          role: 'agent',
          type: 'activity',
          content: 'Tool call denied by permission policy.',
          metadata: { deniedTool: true, toolUseId: part.tool_use_id, detail: text },
        });
      }
      continue;
    }

    if (isError) {
      state.deniedToolStreak = 0;
      out.push({
        kind: 'chat',
        role: 'agent',
        type: 'activity',
        content: text ? `Tool error: ${text.slice(0, 200)}` : 'Tool error',
        metadata: { toolError: true, toolUseId: part.tool_use_id },
      });
      continue;
    }

    state.deniedToolStreak = 0;
    out.push({ kind: 'drop' });
  }
  return out;
};

export const mapEvent = (event: TClaudeStreamEvent, state: IMapperState): TMapResult[] => {
  switch (event.type) {
    case 'system': {
      if (event.subtype === 'init') {
        if (!state.initialized) {
          state.initialized = true;
          return [{ kind: 'status', status: 'idle' }];
        }
        return [{ kind: 'drop' }];
      }
      if (event.subtype === 'api_retry') {
        const attempt = typeof event.attempt === 'number' ? event.attempt : 0;
        const reason = typeof event.error === 'string' ? event.error : 'unknown';
        return [
          {
            kind: 'chat',
            role: 'agent',
            type: 'activity',
            content: `API retry (attempt ${attempt}): ${reason}`,
            metadata: { apiRetry: true, attempt, error: reason },
          },
        ];
      }
      return [{ kind: 'drop' }];
    }

    case 'assistant': {
      const content = event.message?.content;
      if (!Array.isArray(content)) return [{ kind: 'drop' }];
      return mapAssistantContent(content, state);
    }

    case 'user': {
      const content = event.message?.content;
      if (!Array.isArray(content)) return [{ kind: 'drop' }];
      return mapUserContent(content, state);
    }

    case 'result': {
      if (event.subtype === 'success') {
        if (event.stop_reason === 'tool_use') return [{ kind: 'drop' }];
        return [{ kind: 'status', status: 'idle' }];
      }
      const subtype = event.subtype || 'unknown';
      const content =
        typeof event.result === 'string' && event.result.trim()
          ? event.result.trim()
          : `Turn ended with ${subtype}`;
      return [
        {
          kind: 'chat',
          role: 'agent',
          type: 'error',
          content,
          metadata: { resultSubtype: subtype },
        },
        { kind: 'status', status: 'idle' },
      ];
    }

    case 'stream_event':
      return [{ kind: 'drop' }];

    default:
      return [{ kind: 'drop' }];
  }
};
