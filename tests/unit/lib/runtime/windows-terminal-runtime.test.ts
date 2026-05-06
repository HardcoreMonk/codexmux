import { describe, expect, it } from 'vitest';
import { createWindowsTerminalRuntime } from '@/lib/runtime/terminal/windows-terminal-runtime';

describe('Windows terminal runtime skeleton', () => {
  it('fails readiness with an explicit unimplemented runtime error', async () => {
    const runtime = createWindowsTerminalRuntime();

    await expect(runtime.health()).rejects.toMatchObject({
      code: 'runtime-v2-windows-terminal-runtime-unimplemented',
      retryable: false,
    });
  });

  it('fails terminal operations with the same explicit unimplemented runtime error', async () => {
    const runtime = createWindowsTerminalRuntime();

    await expect(runtime.createSession({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    })).rejects.toMatchObject({
      code: 'runtime-v2-windows-terminal-runtime-unimplemented',
      retryable: false,
    });
  });
});
