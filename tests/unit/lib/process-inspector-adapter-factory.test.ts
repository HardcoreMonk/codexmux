import { describe, expect, it } from 'vitest';
import {
  createProcessInspectorAdapter,
  resolveProcessInspectorAdapterKind,
  type IProcessInspector,
} from '@/lib/process-inspector';

const createFakeInspector = (): IProcessInspector => ({
  isRunning: async () => true,
  getChildren: async () => [],
  getChildrenOf: async () => [],
  getDescendants: async () => [],
  getCwd: async () => null,
  getCommand: async () => null,
  getStartTime: async () => null,
  findDescendants: async () => [],
});

describe('process inspector adapter factory', () => {
  it('keeps the current POSIX inspector as the default migration fallback', () => {
    expect(resolveProcessInspectorAdapterKind({
      env: {},
      platform: 'win32',
    })).toBe('posix');
  });

  it('resolves the Windows process inspector kind without claiming it is implemented', () => {
    expect(resolveProcessInspectorAdapterKind({
      env: { CODEXMUX_PROCESS_INSPECTOR_ADAPTER: 'windows' },
      platform: 'win32',
    })).toBe('windows');
  });

  it('fails closed when an unknown process inspector adapter is requested', () => {
    expect(() => resolveProcessInspectorAdapterKind({
      env: { CODEXMUX_PROCESS_INSPECTOR_ADAPTER: 'wmic' },
      platform: 'win32',
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-process-inspector-adapter-unsupported',
      retryable: false,
    }));
  });

  it('creates the selected POSIX process inspector through an injectable factory', async () => {
    const inspector = createProcessInspectorAdapter({
      env: { CODEXMUX_PROCESS_INSPECTOR_ADAPTER: 'posix' },
      createPosixInspector: createFakeInspector,
    });

    await expect(inspector.isRunning(process.pid)).resolves.toBe(true);
  });

  it('creates a Windows inspector skeleton that fails explicitly', async () => {
    const inspector = createProcessInspectorAdapter({
      env: { CODEXMUX_PROCESS_INSPECTOR_ADAPTER: 'windows' },
      platform: 'win32',
    });

    await expect(inspector.isRunning(process.pid)).rejects.toMatchObject({
      code: 'runtime-v2-windows-process-inspector-unimplemented',
      retryable: false,
    });
  });
});
