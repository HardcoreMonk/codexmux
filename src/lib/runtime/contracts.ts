import type { ILayoutData } from '@/types/terminal';
import type { IChunkReadResult, ISessionMeta, TSessionSourceFilter } from '@/types/timeline';
import type { IMessageCountResult } from '@/lib/timeline-message-counts';
import type { ICodexStateInput, IHookStateDecision, IHookStateInput, IStateDecision } from '@/lib/status-state-machine';
import type { TEventName } from '@/types/status';

export interface IRuntimeHealth {
  ok: boolean;
  storage: unknown;
  terminal: unknown;
  timeline: unknown;
  status: unknown;
}

export interface IRuntimeWorkspace {
  id: string;
  name: string;
  defaultCwd: string;
  active: boolean | number;
  groupId?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface IRuntimeCreateWorkspaceResult {
  id: string;
  rootPaneId: string;
}

export interface IRuntimeWorkspaceList {
  workspaces: IRuntimeWorkspace[];
}

export interface IRuntimeWorkspaceTerminalSession {
  sessionName: string;
}

export interface IRuntimeTerminalSessionPresence {
  sessionName: string;
  exists: boolean;
}

export interface IRuntimeDeleteWorkspaceStorageResult {
  deleted: boolean;
  sessions: IRuntimeWorkspaceTerminalSession[];
}

export interface IRuntimeDeleteWorkspaceResult {
  deleted: boolean;
  killedSessions: string[];
  failedKills: Array<{ sessionName: string; error: string }>;
}

export interface IRuntimeDeleteTerminalTabStorageResult {
  deleted: boolean;
  session: IRuntimeWorkspaceTerminalSession | null;
}

export interface IRuntimeDeleteTerminalTabResult {
  deleted: boolean;
  killedSession: string | null;
  failedKill: { sessionName: string; error: string } | null;
}

export interface IRuntimeTerminalTab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  cwd?: string;
  panelType: 'terminal';
  runtimeVersion: 2;
  lifecycleState: 'pending_terminal' | 'ready' | 'failed';
}

export interface IRuntimePendingTerminalTab {
  id: string;
  sessionName: string;
  workspaceId: string;
  paneId: string;
  cwd: string;
  runtimeVersion: 2;
  lifecycleState: 'pending_terminal';
  createdAt: string;
}

export type TRuntimeLayout = ILayoutData | null;

export interface IRuntimeTimelineSessionPage {
  sessions: ISessionMeta[];
  total: number;
  hasMore: boolean;
}

export interface IRuntimeTimelineSessionListInput {
  tmuxSession: string;
  cwd?: string;
  panelType: string;
  offset: number;
  limit: number;
  source: TSessionSourceFilter;
  sourceId: string | null;
}

export interface IRuntimeTimelineEntriesBeforeInput {
  jsonlPath: string;
  beforeByte: number;
  limit: number;
  panelType: string;
}

export type TRuntimeTimelineEntriesBeforeResult = Pick<IChunkReadResult, 'entries' | 'startByteOffset' | 'hasMore'>;

export type TRuntimeTimelineMessageCounts = IMessageCountResult;

export type TRuntimeStatusHookStateInput = IHookStateInput;

export type TRuntimeStatusHookDecision = IHookStateDecision;

export type TRuntimeStatusCodexStateInput = ICodexStateInput;

export type TRuntimeStatusDecision = IStateDecision;

export interface IRuntimeStatusNotificationPolicyInput {
  eventName: TEventName;
  notificationType?: string;
  newState: string;
  silent?: boolean;
}

export interface IRuntimeStatusNotificationPolicyResult {
  processHookEvent: boolean;
  sendReviewNotification: boolean;
  sendNeedsInputNotification: boolean;
}
