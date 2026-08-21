import { describe, expect, it } from 'vitest';

import { buildStatusTabEntry } from '@/lib/status/tab-entry';
import type { ITab } from '@/types/terminal';

const makeTab = (overrides: Partial<ITab> = {}): ITab => ({
  id: 'tab-a',
  sessionName: 'codexmux:tab-a',
  name: '',
  order: 0,
  panelType: 'codex',
  lastUserMessage: 'prompt',
  dismissedAt: 123,
  ...overrides,
});

const baseInput = {
  workspaceId: 'ws-1',
  tab: makeTab(),
  paneInfo: {
    command: 'codex',
    path: '/workspace/a',
    pid: 1234,
    windowActivity: 1,
  },
  cliState: 'ready-for-review' as const,
  terminalStatus: 'idle' as const,
  listeningPorts: [] as number[],
  agentSummary: 'summary',
  agentSessionId: 'session-a',
  jsonlPath: '/tmp/session.jsonl',
  lastAssistantSnippet: 'assistant',
  currentAction: { toolName: 'Bash' as const, summary: 'running' },
  lastEvent: { name: 'notification' as const, at: 1, seq: 0 },
  now: 1_000,
};

describe('status tab entry builder', () => {
  it('builds restored scan entries with lifecycle fields', () => {
    expect(buildStatusTabEntry({
      ...baseInput,
      restoreLifecycleFields: true,
    })).toEqual({
      cliState: 'ready-for-review',
      workspaceId: 'ws-1',
      tabName: 'codex',
      currentProcess: 'codex',
      paneTitle: 'codex|/workspace/a',
      tmuxSession: 'codexmux:tab-a',
      panelType: 'codex',
      terminalStatus: 'idle',
      listeningPorts: [],
      agentSummary: 'summary',
      lastUserMessage: 'prompt',
      lastAssistantMessage: 'assistant',
      currentAction: { toolName: 'Bash', summary: 'running' },
      readyForReviewAt: 1_000,
      busySince: null,
      dismissedAt: 123,
      agentSessionId: 'session-a',
      jsonlPath: '/tmp/session.jsonl',
      lastEvent: { name: 'notification', at: 1, seq: 0 },
      eventSeq: 0,
    });
  });

  it('builds poll-created entries without restored lifecycle fields', () => {
    const entry = buildStatusTabEntry({
      ...baseInput,
      restoreLifecycleFields: false,
    });

    expect(entry.readyForReviewAt).toBeUndefined();
    expect(entry.busySince).toBeUndefined();
    expect(entry.dismissedAt).toBeUndefined();
    expect(entry.tabName).toBe('codex');
  });

  it('uses explicit tab names before pane title fallbacks', () => {
    expect(buildStatusTabEntry({
      ...baseInput,
      tab: makeTab({ name: 'Manual name' }),
      restoreLifecycleFields: false,
    }).tabName).toBe('Manual name');
  });

  it('falls back to an empty pane-derived title when pane info is absent', () => {
    const entry = buildStatusTabEntry({
      ...baseInput,
      paneInfo: undefined,
      tab: makeTab({ name: '' }),
      currentAction: null,
      restoreLifecycleFields: false,
    });

    expect(entry.tabName).toBe('');
    expect(entry.currentProcess).toBeUndefined();
    expect(entry.paneTitle).toBeUndefined();
    expect(entry.currentAction).toBeNull();
  });
});
