import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatusStopRecheckService } from '@/lib/status/stop-recheck-service';

describe('status stop recheck service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules Codex stop recheck after the configured delay', async () => {
    vi.useFakeTimers();
    const recheckCodexStop = vi.fn(async () => {});
    const service = new StatusStopRecheckService({
      delayMs: 500,
      recheckCodexStop,
      refreshStopSnippet: vi.fn(),
      clearJsonlCache: vi.fn(),
      warn: vi.fn(),
    });

    service.scheduleCodexStopRecheck({ tabId: 'tab-a', tmuxSession: 'session-a' });
    await vi.advanceTimersByTimeAsync(499);
    expect(recheckCodexStop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(recheckCodexStop).toHaveBeenCalledWith({ tabId: 'tab-a', tmuxSession: 'session-a' });
  });

  it('warns when delayed Codex stop recheck fails', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const service = new StatusStopRecheckService({
      delayMs: 10,
      recheckCodexStop: vi.fn(async () => {
        throw new Error('recheck failed');
      }),
      refreshStopSnippet: vi.fn(),
      clearJsonlCache: vi.fn(),
      warn,
    });

    service.scheduleCodexStopRecheck({ tabId: 'tab-a', tmuxSession: 'session-a' });
    await vi.advanceTimersByTimeAsync(10);

    expect(warn.mock.calls[0]?.[0]).toContain('Codex stop JSONL verification failed');
    expect(warn.mock.calls[0]?.[0]).toContain('recheck failed');
  });

  it('refreshes stop snippets immediately and after clearing JSONL cache', async () => {
    vi.useFakeTimers();
    const refreshStopSnippet = vi.fn(async () => {});
    const clearJsonlCache = vi.fn();
    const service = new StatusStopRecheckService({
      delayMs: 500,
      recheckCodexStop: vi.fn(),
      refreshStopSnippet,
      clearJsonlCache,
      warn: vi.fn(),
    });

    service.scheduleStopSnippetRefresh({ tabId: 'tab-a', jsonlPath: '/tmp/session.jsonl' });
    expect(refreshStopSnippet).toHaveBeenCalledTimes(1);
    expect(refreshStopSnippet).toHaveBeenCalledWith({ tabId: 'tab-a', jsonlPath: '/tmp/session.jsonl' });
    expect(clearJsonlCache).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(clearJsonlCache).toHaveBeenCalledWith('/tmp/session.jsonl');
    expect(refreshStopSnippet).toHaveBeenCalledTimes(2);
  });
});
