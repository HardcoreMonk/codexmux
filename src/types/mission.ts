export type TMissionStatus = 'pending' | 'running' | 'blocked' | 'completed' | 'failed';
export type TTaskStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';
export type TStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IStep {
  id: string;
  title: string;
  status: TStepStatus;
}

export interface ITaskTabLink {
  workspaceId: string;
  tabId: string;
  workspaceName: string;
}

export interface ITask {
  id: string;
  title: string;
  status: TTaskStatus;
  confirmed: boolean;
  tabLink?: ITaskTabLink;
  steps: IStep[];
}

export interface IMission {
  id: string;
  title: string;
  status: TMissionStatus;
  createdAt: string;
  completedAt?: string;
  tasks: ITask[];
}

export interface IMissionListResponse {
  missions: IMission[];
}

export interface IBlockReasonResponse {
  reason: string;
  chatMessageId: string;
  blockedAt: string;
}

// WebSocket message types

export interface IMissionUpdate {
  type: 'mission:update';
  agentId: string;
  missionId: string;
  taskId?: string;
  stepId?: string;
  status: TTaskStatus | TStepStatus;
  reason?: string;
}

export interface IMissionPlanUpdate {
  type: 'mission:plan-updated';
  agentId: string;
  missionId: string;
  tasks: ITask[];
}

export interface IMissionComplete {
  type: 'mission:complete';
  agentId: string;
  missionId: string;
  status: 'completed' | 'failed';
}

export type TMissionServerMessage = IMissionUpdate | IMissionPlanUpdate | IMissionComplete;
