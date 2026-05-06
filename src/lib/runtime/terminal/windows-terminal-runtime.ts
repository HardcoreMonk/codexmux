import type {
  ITerminalRuntimeAdapter,
  ITerminalRuntimeAttachResult,
  ITerminalRuntimeCreateInput,
  ITerminalRuntimeDetachResult,
  ITerminalRuntimeKillResult,
  ITerminalRuntimePresenceResult,
  ITerminalRuntimeResizeResult,
  ITerminalRuntimeSessionInfo,
  ITerminalRuntimeSessionRef,
  ITerminalRuntimeWriteResult,
} from '@/lib/runtime/terminal/terminal-runtime-contract';

const createWindowsTerminalRuntimeUnimplementedError = (): Error & {
  code: string;
  retryable: false;
} => Object.assign(
  new Error('Windows terminal runtime is not implemented yet. The adapter boundary exists for the ConPTY implementation slice.'),
  {
    code: 'runtime-v2-windows-terminal-runtime-unimplemented',
    retryable: false as const,
  },
);

const failWindowsTerminalRuntime = async <T>(): Promise<T> => {
  throw createWindowsTerminalRuntimeUnimplementedError();
};

export const createWindowsTerminalRuntime = (): ITerminalRuntimeAdapter => ({
  health: () => failWindowsTerminalRuntime(),
  createSession: (_input: ITerminalRuntimeCreateInput): Promise<ITerminalRuntimeSessionRef> =>
    failWindowsTerminalRuntime(),
  attach: (
    _sessionName: string,
    _cols: number,
    _rows: number,
    _onData: (data: string) => void,
  ): Promise<ITerminalRuntimeAttachResult> => failWindowsTerminalRuntime(),
  detach: (_sessionName: string): Promise<ITerminalRuntimeDetachResult> =>
    failWindowsTerminalRuntime(),
  killSession: (_sessionName: string): Promise<ITerminalRuntimeKillResult> =>
    failWindowsTerminalRuntime(),
  hasSession: (_sessionName: string): Promise<ITerminalRuntimePresenceResult> =>
    failWindowsTerminalRuntime(),
  writeStdin: (_sessionName: string, _data: string): Promise<ITerminalRuntimeWriteResult> =>
    failWindowsTerminalRuntime(),
  resize: (_sessionName: string, _cols: number, _rows: number): Promise<ITerminalRuntimeResizeResult> =>
    failWindowsTerminalRuntime(),
  getSessionInfo: (_sessionName: string): Promise<ITerminalRuntimeSessionInfo> =>
    failWindowsTerminalRuntime(),
});
