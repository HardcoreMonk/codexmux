export type TRuntimeStorageV2Mode = 'off' | 'shadow' | 'write' | 'default';

export interface IRuntimeStorageV2ModeOptions {
  runtimeV2Enabled?: boolean;
  storageMode?: unknown;
}

export const parseRuntimeStorageV2Mode = (value: unknown): TRuntimeStorageV2Mode => {
  if (value === 'shadow' || value === 'write' || value === 'default') return value;
  return 'off';
};

export const getRuntimeStorageV2Mode = (env: NodeJS.ProcessEnv = process.env): TRuntimeStorageV2Mode =>
  parseRuntimeStorageV2Mode(env.CODEXMUX_RUNTIME_STORAGE_V2_MODE);

export const shouldMirrorLegacyStorageToRuntimeV2 = ({
  runtimeV2Enabled = process.env.CODEXMUX_RUNTIME_V2 === '1',
  storageMode = process.env.CODEXMUX_RUNTIME_STORAGE_V2_MODE,
}: IRuntimeStorageV2ModeOptions = {}): boolean => {
  if (!runtimeV2Enabled) return false;
  const mode = parseRuntimeStorageV2Mode(storageMode);
  return mode === 'write' || mode === 'default';
};
