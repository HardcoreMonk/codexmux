import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  StatusPollService,
  createStatusPollSnapshot,
  getStatusPollingInterval,
} from '@/lib/status/poll-service';

describe('status poll service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects adaptive polling intervals from tab count', () => {
    expect(getStatusPollingInterval(0)).toBe(30_000);
    expect(getStatusPollingInterval(10)).toBe(30_000);
    expect(getStatusPollingInterval(11)).toBe(45_000);
    expect(getStatusPollingInterval(20)).toBe(45_000);
    expect(getStatusPollingInterval(21)).toBe(60_000);
  });

  it('builds rounded poll snapshots with ISO timestamps', () => {
    const snapshot = createStatusPollSnapshot({
      startedAtMs: 1_000,
      endedAtMs: 1_500,
      durationMs: 12.345,
      counts: {
        workspaceCount: 2,
        paneCount: 3,
        scannedTabCount: 4,
        providerTabCount: 5,
        terminalTabCount: 6,
        broadcastUpdateCount: 7,
        broadcastRemoveCount: 8,
      },
    });

    expect(snapshot).toEqual({
      startedAt: '1970-01-01T00:00:01.000Z',
      endedAt: '1970-01-01T00:00:01.500Z',
      durationMs: 12.35,
      workspaceCount: 2,
      paneCount: 3,
      scannedTabCount: 4,
      providerTabCount: 5,
      terminalTabCount: 6,
      broadcastUpdateCount: 7,
      broadcastRemoveCount: 8,
    });
  });

  it('starts, refreshes, and stops polling timers', async () => {
    vi.useFakeTimers();
    let tabCount = 2;
    const poll = vi.fn(async () => {});
    const recordCounter = vi.fn();
    const errors: string[] = [];
    const service = new StatusPollService({
      getTabCount: () => tabCount,
      poll,
      onPollError: (err) => errors.push(err instanceof Error ? err.message : String(err)),
      recordCounter,
    });

    service.start();
    expect(service.getCurrentInterval()).toBe(30_000);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(poll).toHaveBeenCalledTimes(1);

    tabCount = 12;
    service.refreshInterval();
    expect(service.getCurrentInterval()).toBe(45_000);

    service.stop();
    expect(service.getCurrentInterval()).toBe(0);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(recordCounter).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('records poll errors from timer callbacks', async () => {
    vi.useFakeTimers();
    const recordCounter = vi.fn();
    const errors: string[] = [];
    const service = new StatusPollService({
      getTabCount: () => 1,
      poll: async () => {
        throw new Error('poll failed');
      },
      onPollError: (err) => errors.push(err instanceof Error ? err.message : String(err)),
      recordCounter,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recordCounter).toHaveBeenCalledWith('status.poll.errors');
    expect(errors).toEqual(['poll failed']);
    service.stop();
  });
});
