import { describe, expect, it } from 'vitest';
import {
  getRuntimeTimelineV2Mode,
  parseRuntimeTimelineV2Mode,
  shouldUseRuntimeTimelineV2Live,
} from '@/lib/runtime/timeline-mode';

describe('runtime timeline v2 mode', () => {
  it('parses timeline mode fail-closed', () => {
    expect(parseRuntimeTimelineV2Mode('shadow')).toBe('shadow');
    expect(parseRuntimeTimelineV2Mode('default')).toBe('default');
    expect(parseRuntimeTimelineV2Mode('write')).toBe('off');
    expect(parseRuntimeTimelineV2Mode(undefined)).toBe('off');
  });

  it('allows live timeline ownership only for runtime default mode', () => {
    expect(shouldUseRuntimeTimelineV2Live({
      runtimeV2Enabled: true,
      timelineMode: 'default',
    })).toBe(true);
    expect(shouldUseRuntimeTimelineV2Live({
      runtimeV2Enabled: true,
      timelineMode: 'shadow',
    })).toBe(false);
    expect(shouldUseRuntimeTimelineV2Live({
      runtimeV2Enabled: false,
      timelineMode: 'default',
    })).toBe(false);
  });

  it('reads timeline mode from an explicit env object', () => {
    expect(getRuntimeTimelineV2Mode({
      CODEXMUX_RUNTIME_TIMELINE_V2_MODE: 'shadow',
    } as unknown as NodeJS.ProcessEnv)).toBe('shadow');
  });
});
