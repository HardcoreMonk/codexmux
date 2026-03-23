export type TSessionStatus = 'active' | 'none' | 'not-installed';

export type TCliState = 'idle' | 'busy' | 'inactive';

export type TTimelineConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ISessionInfo {
  status: TSessionStatus;
  sessionId: string | null;
  jsonlPath: string | null;
  pid: number | null;
  startedAt: number | null;
  cwd: string | null;
}

export type TTimelineEntryType =
  | 'user-message'
  | 'assistant-message'
  | 'tool-call'
  | 'tool-result'
  | 'agent-group'
  | 'task-notification'
  | 'interrupt'
  | 'session-exit'
  | 'turn-end';

export interface ITimelineUserMessage {
  id: string;
  type: 'user-message';
  timestamp: number;
  text: string;
}

export interface ITimelineAssistantMessage {
  id: string;
  type: 'assistant-message';
  timestamp: number;
  markdown: string;
  stopReason?: string | null;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export type TToolName = 'Read' | 'Edit' | 'Write' | 'Bash' | 'Grep' | 'Glob' | 'Agent' | string;

export type TToolStatus = 'pending' | 'success' | 'error';

export interface ITimelineDiff {
  filePath: string;
  oldString: string;
  newString: string;
}

export interface ITimelineToolCall {
  id: string;
  type: 'tool-call';
  timestamp: number;
  toolUseId: string;
  toolName: TToolName;
  summary: string;
  filePath?: string;
  diff?: ITimelineDiff;
  status: TToolStatus;
}

export interface ITimelineToolResult {
  id: string;
  type: 'tool-result';
  timestamp: number;
  toolUseId: string;
  isError: boolean;
  summary: string;
}

export interface ITimelineAgentGroup {
  id: string;
  type: 'agent-group';
  timestamp: number;
  agentType: string;
  description: string;
  entryCount: number;
}

export interface ITimelineTaskNotification {
  id: string;
  type: 'task-notification';
  timestamp: number;
  taskId: string;
  status: 'completed' | 'failed' | string;
  summary: string;
  result?: string;
  usage?: {
    totalTokens?: number;
    toolUses?: number;
    durationMs?: number;
  };
}

export interface ITimelineInterrupt {
  id: string;
  type: 'interrupt';
  timestamp: number;
}

export interface ITimelineSessionExit {
  id: string;
  type: 'session-exit';
  timestamp: number;
}

export interface ITimelineTurnEnd {
  id: string;
  type: 'turn-end';
  timestamp: number;
}

export type ITimelineEntry =
  | ITimelineUserMessage
  | ITimelineAssistantMessage
  | ITimelineToolCall
  | ITimelineToolResult
  | ITimelineAgentGroup
  | ITimelineTaskNotification
  | ITimelineInterrupt
  | ITimelineSessionExit
  | ITimelineTurnEnd;

export interface ITimelineInitMessage {
  type: 'timeline:init';
  entries: ITimelineEntry[];
  sessionId: string;
  totalEntries: number;
  summary?: string;
}

export interface ITimelineAppendMessage {
  type: 'timeline:append';
  entries: ITimelineEntry[];
}

export interface ITimelineSessionChangedMessage {
  type: 'timeline:session-changed';
  newSessionId: string;
  reason: string;
}

export interface ITimelineErrorMessage {
  type: 'timeline:error';
  code: string;
  message: string;
}

export interface ITimelineResumeStartedMessage {
  type: 'timeline:resume-started';
  sessionId: string;
  jsonlPath: string | null;
}

export interface ITimelineResumeBlockedMessage {
  type: 'timeline:resume-blocked';
  reason: string;
  processName?: string;
}

export interface ITimelineResumeErrorMessage {
  type: 'timeline:resume-error';
  message: string;
}

export type TTimelineServerMessage =
  | ITimelineInitMessage
  | ITimelineAppendMessage
  | ITimelineSessionChangedMessage
  | ITimelineErrorMessage
  | ITimelineResumeStartedMessage
  | ITimelineResumeBlockedMessage
  | ITimelineResumeErrorMessage;

export interface ITimelineSubscribeMessage {
  type: 'timeline:subscribe';
  jsonlPath: string;
}

export interface ITimelineUnsubscribeMessage {
  type: 'timeline:unsubscribe';
}

export interface ITimelineResumeMessage {
  type: 'timeline:resume';
  sessionId: string;
  tmuxSession: string;
}

export type TTimelineClientMessage =
  | ITimelineSubscribeMessage
  | ITimelineUnsubscribeMessage
  | ITimelineResumeMessage;

export interface IParseResult {
  entries: ITimelineEntry[];
  lastOffset: number;
  totalLines: number;
  errorCount: number;
  summary?: string;
}

export interface IIncrementalResult {
  newEntries: ITimelineEntry[];
  newOffset: number;
  pendingBuffer: string;
}

export interface ISessionMeta {
  sessionId: string;
  startedAt: string;
  lastActivityAt: string;
  firstMessage: string;
  turnCount: number;
}
