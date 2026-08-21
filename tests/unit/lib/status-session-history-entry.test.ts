import { describe, expect, it } from 'vitest';

import { buildStatusSessionHistoryEntry } from '@/lib/status/session-history-entry';
import type { ITabStatusEntry } from '@/types/status';

const makeEntry = (overrides: Partial<ITabStatusEntry> = {}): ITabStatusEntry => ({
  cliState: 'ready-for-review',
  workspaceId: 'ws-1',
  tabName: 'Codex tab',
  tmuxSession: 'codexmux:tab',
  agentSessionId: 'session-a',
  lastUserMessage: 'fallback prompt',
  ...overrides,
});

describe('status session history entry builder', () => {
  it('builds a completed entry from JSONL stats when available', () => {
    const entry = buildStatusSessionHistoryEntry({
      id: 'history-a',
      tabId: 'tab-a',
      entry: makeEntry(),
      workspaceName: 'Workspace A',
      workspaceDir: '/workspace/a',
      stats: {
        toolUsage: { Edit: 2 },
        touchedFiles: ['src/a.ts'],
        lastAssistantText: 'assistant result',
        lastUserText: 'stats prompt',
        firstUserTs: 1_000,
        lastAssistantTs: 4_500,
        turnDurationMs: 3_250,
      },
      prevBusySince: 900,
      cancelled: false,
      now: 5_000,
    });

    expect(entry).toEqual({
      id: 'history-a',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace A',
      workspaceDir: '/workspace/a',
      tabId: 'tab-a',
      agentSessionId: 'session-a',
      prompt: 'stats prompt',
      result: 'assistant result',
      startedAt: 1_000,
      completedAt: 4_500,
      duration: 3_250,
      dismissedAt: 4_500,
      toolUsage: { Edit: 2 },
      touchedFiles: ['src/a.ts'],
    });
  });

  it('uses fallback prompt and marks cancelled sessions', () => {
    const entry = buildStatusSessionHistoryEntry({
      id: 'history-b',
      tabId: 'tab-b',
      entry: makeEntry({
        lastUserMessage: 'cancelled prompt',
        agentSessionId: null,
      }),
      workspaceName: 'ws-1',
      workspaceDir: null,
      stats: null,
      prevBusySince: 2_000,
      cancelled: true,
      now: 6_000,
    });

    expect(entry).toEqual({
      id: 'history-b',
      workspaceId: 'ws-1',
      workspaceName: 'ws-1',
      workspaceDir: null,
      tabId: 'tab-b',
      agentSessionId: null,
      prompt: 'cancelled prompt',
      result: null,
      startedAt: 2_000,
      completedAt: 6_000,
      duration: 4_000,
      dismissedAt: 6_000,
      toolUsage: {},
      touchedFiles: [],
      cancelled: true,
    });
  });
});
