export type TSessionStatus = 'active' | 'inactive' | 'none' | 'not-installed';

export type TTimelineConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ISessionInfo {
  status: TSessionStatus;
  sessionId: string | null;
  jsonlPath: string | null;
  pid: number | null;
  startedAt: number | null;
}

export type TTimelineEntryType =
  | 'user-message'
  | 'assistant-message'
  | 'tool-call'
  | 'tool-result'
  | 'agent-group';

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
  text: string;
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

export type ITimelineEntry =
  | ITimelineUserMessage
  | ITimelineAssistantMessage
  | ITimelineToolCall
  | ITimelineToolResult
  | ITimelineAgentGroup;

export interface ITimelineInitMessage {
  type: 'timeline:init';
  entries: ITimelineEntry[];
  sessionId: string;
  totalEntries: number;
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

export type TTimelineServerMessage =
  | ITimelineInitMessage
  | ITimelineAppendMessage
  | ITimelineSessionChangedMessage
  | ITimelineErrorMessage;

export interface ITimelineSubscribeMessage {
  type: 'timeline:subscribe';
  jsonlPath: string;
}

export interface ITimelineUnsubscribeMessage {
  type: 'timeline:unsubscribe';
}

export type TTimelineClientMessage =
  | ITimelineSubscribeMessage
  | ITimelineUnsubscribeMessage;

export interface IParseResult {
  entries: ITimelineEntry[];
  lastOffset: number;
  totalLines: number;
  errorCount: number;
}

export interface IIncrementalResult {
  newEntries: ITimelineEntry[];
  newOffset: number;
  pendingBuffer: string;
}
