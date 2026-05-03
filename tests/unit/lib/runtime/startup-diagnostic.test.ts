import { describe, expect, it, vi } from 'vitest';
import { runRuntimeStartupDiagnostic } from '@/lib/runtime/startup-diagnostic';

describe('runtime startup diagnostic', () => {
  it('calls runtime health without blocking the caller', async () => {
    let resolveHealth: (() => void) | undefined;
    const supervisor = {
      health: vi.fn(() => new Promise<void>((resolve) => {
        resolveHealth = resolve;
      })),
    };
    const logger = { info: vi.fn(), error: vi.fn() };

    runRuntimeStartupDiagnostic(supervisor, logger);

    expect(supervisor.health).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
    resolveHealth?.();
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('runtime v2 startup diagnostic passed');
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs failed runtime health without throwing', async () => {
    const supervisor = {
      health: vi.fn().mockRejectedValue(new Error('storage health failed')),
    };
    const logger = { info: vi.fn(), error: vi.fn() };

    expect(() => runRuntimeStartupDiagnostic(supervisor, logger)).not.toThrow();

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith('runtime v2 startup diagnostic failed: storage health failed');
    });
    expect(logger.info).not.toHaveBeenCalled();
  });
});
