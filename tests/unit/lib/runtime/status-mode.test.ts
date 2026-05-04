import { describe, expect, it } from 'vitest';
import {
  getRuntimeStatusV2Mode,
  parseRuntimeStatusV2Mode,
  shouldUseRuntimeStatusV2Live,
} from '@/lib/runtime/status-mode';

describe('runtime status v2 mode', () => {
  it('parses status mode fail-closed', () => {
    expect(parseRuntimeStatusV2Mode('shadow')).toBe('shadow');
    expect(parseRuntimeStatusV2Mode('default')).toBe('default');
    expect(parseRuntimeStatusV2Mode('write')).toBe('off');
    expect(parseRuntimeStatusV2Mode(undefined)).toBe('off');
  });

  it('allows live status ownership only for runtime default mode', () => {
    expect(shouldUseRuntimeStatusV2Live({
      runtimeV2Enabled: true,
      statusMode: 'default',
    })).toBe(true);
    expect(shouldUseRuntimeStatusV2Live({
      runtimeV2Enabled: true,
      statusMode: 'shadow',
    })).toBe(false);
    expect(shouldUseRuntimeStatusV2Live({
      runtimeV2Enabled: false,
      statusMode: 'default',
    })).toBe(false);
  });

  it('reads status mode from an explicit env object', () => {
    expect(getRuntimeStatusV2Mode({
      CODEXMUX_RUNTIME_STATUS_V2_MODE: 'shadow',
    } as unknown as NodeJS.ProcessEnv)).toBe('shadow');
  });
});
