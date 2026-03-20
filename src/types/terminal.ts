export type TConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'session-ended';

export type TDisconnectReason = 'max-connections' | 'pty-error' | null;

export interface ITab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
}
