export interface IToolStatus {
  installed: boolean;
  version: string | null;
}

export interface IPreflightResult {
  tmux: IToolStatus & { compatible: boolean };
  git: IToolStatus;
  claude: IToolStatus & { binaryPath: string | null; loggedIn: boolean };
  brew: IToolStatus;
  clt: { installed: boolean };
}
