import { describe, expect, it } from 'vitest';

import { normalizeSessionHistoryData } from '@/lib/session-history';

describe('session history normalization', () => {
  it('preserves agent session ids', () => {
    const data = normalizeSessionHistoryData({
      version: 1,
      entries: [{
        id: 'entry-1',
        workspaceId: 'ws-test',
        workspaceName: 'Test',
        workspaceDir: null,
        tabId: 'tab-test',
        agentSessionId: 'agent-session',
        prompt: 'prompt',
        result: 'result',
        startedAt: 1,
        completedAt: 2,
        duration: 1,
        dismissedAt: null,
        toolUsage: {},
        touchedFiles: [],
      }],
    });

    expect(data.entries[0]).toMatchObject({
      agentSessionId: 'agent-session',
    });
  });
});
