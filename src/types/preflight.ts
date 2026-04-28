export interface IToolStatus {
  installed: boolean;
  version: string | null;
}

export type TAgentPreflightStatus = IToolStatus & {
  binaryPath: string | null;
  loggedIn: boolean;
};

export interface IPreflightResult {
  tmux: IToolStatus & { compatible: boolean };
  git: IToolStatus;
  agent: TAgentPreflightStatus;
  brew?: IToolStatus;
  clt?: { installed: boolean };
}

export interface IRuntimePreflightResult {
  tmux: IToolStatus & { compatible: boolean };
  git: IToolStatus;
  agent: IToolStatus;
}

export const readRuntimeAgentStatus = (status: IRuntimePreflightResult): IToolStatus =>
  status.agent;

export const isRuntimeOk = (status: IRuntimePreflightResult): boolean =>
  status.tmux.installed && status.tmux.compatible && status.git.installed && readRuntimeAgentStatus(status).installed;
