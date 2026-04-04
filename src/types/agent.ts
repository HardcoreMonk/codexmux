export type TAgentStatus = 'idle' | 'working' | 'blocked' | 'offline';

export interface IAgentConfig {
  name: string;
  role: string;
  projects: string[];
  autonomy: string;
  createdAt: string;
}

export interface IAgentInfo {
  id: string;
  name: string;
  role: string;
  projects: string[];
  status: TAgentStatus;
  createdAt: string;
  tmuxSession: string;
}

export interface IChatMessage {
  id: string;
  timestamp: string;
  role: 'user' | 'agent';
  type: 'text' | 'report' | 'question' | 'done' | 'error' | 'approval';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IChatIndex {
  sessions: Array<{
    id: string;
    agentId: string;
    createdAt: string;
    lastMessageAt: string;
    missionId?: string;
  }>;
}

// API request/response types

export interface ICreateAgentRequest {
  name: string;
  role: string;
  projects: string[];
}

export interface ICreateAgentResponse {
  id: string;
  name: string;
  role: string;
  projects: string[];
  status: TAgentStatus;
}

export interface IAgentListResponse {
  agents: Array<{
    id: string;
    name: string;
    role: string;
    projects: string[];
    status: TAgentStatus;
  }>;
}

export interface IAgentDetailResponse {
  id: string;
  name: string;
  role: string;
  projects: string[];
  status: TAgentStatus;
  createdAt: string;
}

export interface IUpdateAgentRequest {
  name?: string;
  role?: string;
  projects?: string[];
}

export interface ISendMessageRequest {
  content: string;
}

export interface ISendMessageResponse {
  id: string;
  status: 'sent' | 'queued';
}

export interface IAgentMessageRequest {
  agentId: string;
  type: 'report' | 'question' | 'done' | 'error' | 'approval';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IAgentMessageResponse {
  id: string;
  received: true;
}

export interface IChatHistoryQuery {
  sessionId?: string;
  limit?: number;
  before?: string;
}

export interface IChatHistoryResponse {
  sessionId: string;
  messages: IChatMessage[];
  hasMore: boolean;
}

// Workspace types

export type TAgentTabStatus = 'running' | 'completed' | 'idle' | 'failed';

export interface IAgentTab {
  tabId: string;
  tabName: string;
  taskTitle?: string;
  taskId?: string;
  status: TAgentTabStatus;
}

// Agent tab execution types

export type TAgentExecTabStatus = 'idle' | 'working' | 'completed' | 'error';

export interface IAgentExecTab {
  tabId: string;
  agentId: string;
  workspaceId: string;
  tmuxSession: string;
  paneId: string;
  taskTitle?: string;
  status: TAgentExecTabStatus;
  createdAt: string;
  lastActivity?: string;
}

export interface IAgentTabsFile {
  tabs: IAgentExecTab[];
}

export interface ICreateTabRequest {
  workspaceId: string;
  taskTitle?: string;
}

export interface ICreateTabResponse {
  tabId: string;
  workspaceId: string;
  tmuxSession: string;
}

export interface ITabSendRequest {
  content: string;
}

export interface ITabSendResponse {
  status: 'sent' | 'queued';
}

export interface ITabStatusResponse {
  tabId: string;
  status: TAgentExecTabStatus;
  lastActivity?: string;
}

export interface ITabResultResponse {
  content: string;
  source: 'file' | 'jsonl' | 'buffer';
}

export interface IProjectGroup {
  workspaceId: string;
  workspaceName: string;
  projectPath: string;
  tabs: IAgentTab[];
}

export interface IActivityEntry {
  timestamp: string;
  action: string;
  projectName?: string;
}

export interface IAgentWorkspaceResponse {
  agentId: string;
  brainSession: {
    tmuxSession: string;
    status: TAgentStatus;
  };
  stats: {
    runningTasks: number;
    completedTasks: number;
    uptimeSeconds: number;
  };
  projectGroups: IProjectGroup[];
  recentActivity: IActivityEntry[];
}

// Workspace WebSocket events

export interface IWorkspaceTabAdded {
  type: 'workspace:tab-added';
  agentId: string;
  workspaceId: string;
  tab: IAgentTab;
}

export interface IWorkspaceTabUpdated {
  type: 'workspace:tab-updated';
  agentId: string;
  tabId: string;
  status: TAgentTabStatus;
}

export interface IWorkspaceTabRemoved {
  type: 'workspace:tab-removed';
  agentId: string;
  tabId: string;
}

export interface IWorkspaceActivity {
  type: 'workspace:activity';
  agentId: string;
  entry: IActivityEntry;
}

export type TWorkspaceServerMessage =
  | IWorkspaceTabAdded
  | IWorkspaceTabUpdated
  | IWorkspaceTabRemoved
  | IWorkspaceActivity;

// WebSocket message types

export interface IAgentStatusSync {
  type: 'agent:sync';
  agents: Array<{
    id: string;
    name: string;
    status: TAgentStatus;
  }>;
}

export interface IAgentStatusUpdate {
  type: 'agent:status';
  agentId: string;
  status: TAgentStatus;
}

export interface IAgentChatMessage {
  type: 'agent:message';
  agentId: string;
  message: IChatMessage;
}

export type TAgentServerMessage = IAgentStatusSync | IAgentStatusUpdate | IAgentChatMessage;
