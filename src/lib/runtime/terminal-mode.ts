import type { TRuntimeVersion } from '@/types/terminal';

export type TRuntimeTerminalV2Mode = 'off' | 'opt-in' | 'new-tabs' | 'default';

export interface IShouldCreateTerminalTabInRuntimeV2Options {
  runtimeV2Enabled?: boolean;
  terminalMode?: unknown;
  explicitOptIn?: boolean;
}

export const parseRuntimeTerminalV2Mode = (value: unknown): TRuntimeTerminalV2Mode => {
  if (value === 'opt-in' || value === 'new-tabs' || value === 'default') return value;
  return 'off';
};

export const getRuntimeTerminalV2Mode = (env: NodeJS.ProcessEnv = process.env): TRuntimeTerminalV2Mode =>
  parseRuntimeTerminalV2Mode(env.CODEXMUX_RUNTIME_TERMINAL_V2_MODE);

export const shouldCreateTerminalTabInRuntimeV2 = ({
  runtimeV2Enabled = process.env.CODEXMUX_RUNTIME_V2 === '1',
  terminalMode = process.env.CODEXMUX_RUNTIME_TERMINAL_V2_MODE,
  explicitOptIn = false,
}: IShouldCreateTerminalTabInRuntimeV2Options = {}): boolean => {
  if (!runtimeV2Enabled) return false;
  const mode = parseRuntimeTerminalV2Mode(terminalMode);
  if (mode === 'new-tabs' || mode === 'default') return true;
  if (mode === 'opt-in') return explicitOptIn;
  return false;
};

export const resolveTabRuntimeVersion = (tab: { runtimeVersion?: unknown }): TRuntimeVersion =>
  tab.runtimeVersion === 2 ? 2 : 1;
