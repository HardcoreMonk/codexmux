export type TRemoteTerminalCommandType = 'stdin' | 'resize' | 'kill';

export interface IRemoteTerminalCommand {
  seq: number;
  type: TRemoteTerminalCommandType;
  createdAt: string;
  data?: string;
  cols?: number;
  rows?: number;
}

export interface IRemoteTerminalStatus {
  sourceId: string;
  terminalId: string;
  sourceLabel: string;
  host: string | null;
  shell: string | null;
  cwd: string | null;
  cols: number;
  rows: number;
  commandSeq: number;
  outputSeq: number;
  pendingCommandCount: number;
  outputBytes: number;
  connectedClientCount: number;
  createdAt: string;
  lastSeenAt: string;
  lastCommandAt: string | null;
  lastOutputAt: string | null;
}
