import type { ITerminalRuntimeAdapter } from '@/lib/runtime/terminal/terminal-runtime-contract';
import { createTerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-runtime';

export type TTerminalRuntimeAdapterKind = 'tmux';

export interface ITerminalRuntimeAdapterFactoryEnv {
  [key: string]: string | undefined;
  CODEXMUX_RUNTIME_TERMINAL_ADAPTER?: string;
}

export interface IResolveTerminalRuntimeAdapterKindOptions {
  env?: ITerminalRuntimeAdapterFactoryEnv;
  platform?: NodeJS.Platform;
}

export interface ICreateTerminalRuntimeAdapterOptions extends IResolveTerminalRuntimeAdapterKindOptions {
  createTmuxRuntime?: () => ITerminalRuntimeAdapter;
}

const createUnsupportedTerminalAdapterError = (value: string): Error & {
  code: string;
  retryable: false;
} => Object.assign(
  new Error(`Unsupported runtime v2 terminal adapter: ${value}`),
  {
    code: 'runtime-v2-terminal-adapter-unsupported',
    retryable: false as const,
  },
);

export const resolveTerminalRuntimeAdapterKind = ({
  env = process.env,
}: IResolveTerminalRuntimeAdapterKindOptions = {}): TTerminalRuntimeAdapterKind => {
  const value = env.CODEXMUX_RUNTIME_TERMINAL_ADAPTER?.trim().toLowerCase();
  if (!value || value === 'tmux') return 'tmux';
  throw createUnsupportedTerminalAdapterError(value);
};

export const createTerminalRuntimeAdapter = ({
  createTmuxRuntime = createTerminalWorkerRuntime,
  ...options
}: ICreateTerminalRuntimeAdapterOptions = {}): ITerminalRuntimeAdapter => {
  const kind = resolveTerminalRuntimeAdapterKind(options);
  if (kind === 'tmux') return createTmuxRuntime();
  throw createUnsupportedTerminalAdapterError(kind);
};
