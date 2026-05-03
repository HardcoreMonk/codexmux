import { describe, expect, it, vi } from 'vitest';
import { preflightTerminalRuntime } from '@/lib/terminal-runtime-preflight';

const response = (status: number, body: unknown): Response =>
  ({
    status,
    json: vi.fn(async () => body),
  }) as unknown as Response;

describe('terminal runtime preflight', () => {
  it('skips preflight for legacy terminal endpoints', async () => {
    const fetcher = vi.fn();

    await expect(preflightTerminalRuntime({
      endpoint: '/api/terminal',
      fetcher,
    })).resolves.toEqual({ ok: true });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows v2 terminal connects when runtime health is available', async () => {
    const fetcher = vi.fn(async () => response(200, { ok: true }));

    await expect(preflightTerminalRuntime({
      endpoint: '/api/v2/terminal',
      fetcher,
    })).resolves.toEqual({ ok: true });

    expect(fetcher).toHaveBeenCalledWith('/api/v2/runtime/health', {
      headers: { Accept: 'application/json' },
    });
  });

  it('returns a runtime-v2-disabled reason when rollback mode disables v2 health', async () => {
    const fetcher = vi.fn(async () => response(404, { error: 'runtime-v2-disabled' }));

    await expect(preflightTerminalRuntime({
      endpoint: '/api/v2/terminal',
      fetcher,
    })).resolves.toEqual({
      ok: false,
      reason: 'runtime-v2-disabled',
    });
  });

  it('allows the websocket attempt for unrelated preflight failures', async () => {
    const fetcher = vi.fn(async () => response(404, { error: 'not-found' }));

    await expect(preflightTerminalRuntime({
      endpoint: '/api/v2/terminal',
      fetcher,
    })).resolves.toEqual({ ok: true });
  });
});
