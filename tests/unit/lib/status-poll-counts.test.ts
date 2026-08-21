import { describe, expect, it } from 'vitest';

import {
  applyStatusPollTraversalCounts,
  createStatusPollCounts,
  recordStatusPollBroadcastRemove,
  recordStatusPollBroadcastUpdate,
  recordStatusPollTabKind,
} from '@/lib/status/poll-counts';

describe('status poll counts', () => {
  it('aggregates traversal, tab kind, and broadcast counters', () => {
    const counts = createStatusPollCounts();

    applyStatusPollTraversalCounts(counts, {
      workspaceCount: 2,
      scannedTabCount: 5,
      paneCount: 4,
    });
    recordStatusPollTabKind(counts, true);
    recordStatusPollTabKind(counts, false);
    recordStatusPollTabKind(counts, true);
    recordStatusPollBroadcastUpdate(counts);
    recordStatusPollBroadcastUpdate(counts);
    recordStatusPollBroadcastRemove(counts);

    expect(counts).toEqual({
      workspaceCount: 2,
      paneCount: 4,
      scannedTabCount: 5,
      providerTabCount: 2,
      terminalTabCount: 1,
      broadcastUpdateCount: 2,
      broadcastRemoveCount: 1,
    });
  });
});
