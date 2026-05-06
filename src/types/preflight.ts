export interface IToolStatus {
  installed: boolean;
  version: string | null;
}

export type TTerminalRuntimeAdapter = 'tmux' | 'windows';

export type TTerminalRuntimePreflightStatus = IToolStatus & {
  adapter: TTerminalRuntimeAdapter;
  compatible: boolean;
};

export type TAgentPreflightStatus = IToolStatus & {
  binaryPath: string | null;
  loggedIn: boolean;
};

export interface IPreflightResult {
  platform?: NodeJS.Platform;
  tmux: IToolStatus & { compatible: boolean };
  terminalRuntime?: TTerminalRuntimePreflightStatus;
  git: IToolStatus;
  agent: TAgentPreflightStatus;
  brew?: IToolStatus;
  clt?: { installed: boolean };
}

export interface IRuntimePreflightResult {
  platform?: NodeJS.Platform;
  tmux: IToolStatus & { compatible: boolean };
  terminalRuntime?: TTerminalRuntimePreflightStatus;
  git: IToolStatus;
  agent: IToolStatus;
}

export const readRuntimeAgentStatus = (status: IRuntimePreflightResult): IToolStatus =>
  status.agent;

export const readRuntimeTerminalStatus = (status: IRuntimePreflightResult): TTerminalRuntimePreflightStatus =>
  status.terminalRuntime ?? { ...status.tmux, adapter: 'tmux' };

export const readRuntimeTerminalName = (status: IRuntimePreflightResult): string =>
  readRuntimeTerminalStatus(status).adapter === 'windows'
    ? 'Windows Terminal Runtime'
    : 'tmux';

export const readPreflightTerminalStatus = (status: IPreflightResult): TTerminalRuntimePreflightStatus =>
  status.terminalRuntime ?? { ...status.tmux, adapter: 'tmux' };

export const readPreflightTerminalName = (status: IPreflightResult): string =>
  readPreflightTerminalStatus(status).adapter === 'windows'
    ? 'Windows Terminal Runtime'
    : 'tmux';

export const isRuntimeOk = (status: IRuntimePreflightResult): boolean =>
  readRuntimeTerminalStatus(status).installed
  && readRuntimeTerminalStatus(status).compatible
  && status.git.installed
  && readRuntimeAgentStatus(status).installed;
