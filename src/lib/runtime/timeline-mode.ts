export type TRuntimeTimelineV2Mode = 'off' | 'shadow' | 'default';

export interface IRuntimeTimelineV2ModeOptions {
  runtimeV2Enabled?: boolean;
  timelineMode?: unknown;
}

export const parseRuntimeTimelineV2Mode = (value: unknown): TRuntimeTimelineV2Mode => {
  if (value === 'shadow' || value === 'default') return value;
  return 'off';
};

export const getRuntimeTimelineV2Mode = (env: NodeJS.ProcessEnv = process.env): TRuntimeTimelineV2Mode =>
  parseRuntimeTimelineV2Mode(env.CODEXMUX_RUNTIME_TIMELINE_V2_MODE);

export const shouldUseRuntimeTimelineV2Live = ({
  runtimeV2Enabled = process.env.CODEXMUX_RUNTIME_V2 === '1',
  timelineMode = process.env.CODEXMUX_RUNTIME_TIMELINE_V2_MODE,
}: IRuntimeTimelineV2ModeOptions = {}): boolean => {
  if (!runtimeV2Enabled) return false;
  return parseRuntimeTimelineV2Mode(timelineMode) === 'default';
};
