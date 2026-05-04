import { describe, expect, it } from 'vitest';
import {
  getRuntimeStorageV2Mode,
  parseRuntimeStorageV2Mode,
  shouldMirrorLegacyStorageToRuntimeV2,
} from '@/lib/runtime/storage-mode';

describe('runtime storage v2 mode', () => {
  it('parses only supported storage mode values', () => {
    expect(parseRuntimeStorageV2Mode('shadow')).toBe('shadow');
    expect(parseRuntimeStorageV2Mode('write')).toBe('write');
    expect(parseRuntimeStorageV2Mode('default')).toBe('default');
    expect(parseRuntimeStorageV2Mode('unexpected')).toBe('off');
    expect(parseRuntimeStorageV2Mode(undefined)).toBe('off');
  });

  it('mirrors legacy JSON writes only when runtime v2 and write ownership are enabled', () => {
    expect(shouldMirrorLegacyStorageToRuntimeV2({
      runtimeV2Enabled: true,
      storageMode: 'write',
    })).toBe(true);
    expect(shouldMirrorLegacyStorageToRuntimeV2({
      runtimeV2Enabled: true,
      storageMode: 'default',
    })).toBe(true);
    expect(shouldMirrorLegacyStorageToRuntimeV2({
      runtimeV2Enabled: true,
      storageMode: 'shadow',
    })).toBe(false);
    expect(shouldMirrorLegacyStorageToRuntimeV2({
      runtimeV2Enabled: false,
      storageMode: 'write',
    })).toBe(false);
  });

  it('reads storage mode from an explicit env object', () => {
    expect(getRuntimeStorageV2Mode({
      CODEXMUX_RUNTIME_STORAGE_V2_MODE: 'write',
    } as unknown as NodeJS.ProcessEnv)).toBe('write');
  });
});
