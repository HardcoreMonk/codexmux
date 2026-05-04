export type TRuntimeStatusV2Mode = 'off' | 'shadow' | 'default';

export interface IRuntimeStatusV2ModeOptions {
  runtimeV2Enabled?: boolean;
  statusMode?: unknown;
}

export const parseRuntimeStatusV2Mode = (value: unknown): TRuntimeStatusV2Mode => {
  if (value === 'shadow' || value === 'default') return value;
  return 'off';
};

export const getRuntimeStatusV2Mode = (env: NodeJS.ProcessEnv = process.env): TRuntimeStatusV2Mode =>
  parseRuntimeStatusV2Mode(env.CODEXMUX_RUNTIME_STATUS_V2_MODE);

export const shouldUseRuntimeStatusV2Live = ({
  runtimeV2Enabled = process.env.CODEXMUX_RUNTIME_V2 === '1',
  statusMode = process.env.CODEXMUX_RUNTIME_STATUS_V2_MODE,
}: IRuntimeStatusV2ModeOptions = {}): boolean => {
  if (!runtimeV2Enabled) return false;
  return parseRuntimeStatusV2Mode(statusMode) === 'default';
};
