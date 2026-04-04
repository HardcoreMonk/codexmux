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
