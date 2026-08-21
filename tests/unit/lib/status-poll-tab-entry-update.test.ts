import { describe, expect, it } from 'vitest';

import { applyStatusPollTabEntryUpdate } from '@/lib/status/poll-tab-entry-update';
import type { ITabStatusEntry } from '@/types/status';
import type { ITab } from '@/types/terminal';

const makeEntry = (overrides: Partial<ITabStatusEntry> = {}): ITabStatusEntry => ({
  cliState: 'busy',
  workspaceId: 'ws-old',
  tabName: 'Old tab',
  currentProcess: 'old-process',
  paneTitle: 'old-process|/old',
  tmuxSession: 'session-a',
  panelType: 'codex',
  terminalStatus: 'running',
  listeningPorts: [3000],
  agentSummary: 'old summary',
  lastUserMessage: 'old prompt',
  agentSessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  jsonlPath: '/tmp/old.jsonl',
  processRetries: 1,
  ...overrides,
});

const makeTab = (overrides: Partial<ITab> = {}): ITab => ({
  id: 'tab-a',
  sessionName: 'session-a',
  name: '',
  order: 0,
  panelType: 'codex',
  lastUserMessage: 'new prompt',
  ...overrides,
});

describe('status poll tab entry update', () => {
  it('applies layout, pane, terminal, summary, and session fields to an existing entry', () => {
    const entry = makeEntry();

    applyStatusPollTabEntryUpdate({
      entry,
      workspaceId: 'ws-new',
      tab: makeTab(),
      paneTitle: 'codex|/repo',
      currentProcess: 'codex',
      refreshed: {
        sessionId: null,
        jsonlPath: '/tmp/11111111-2222-3333-4444-555555555555.jsonl',
      },
      persistedSessionId: null,
      processRetries: 3,
      terminalChanged: true,
      terminalStatus: 'idle',
      listeningPorts: [],
      summaryChanged: true,
      agentSummary: 'new summary',
    });

    expect(entry).toMatchObject({
      workspaceId: 'ws-new',
      tabName: 'codex',
      currentProcess: 'codex',
      paneTitle: 'codex|/repo',
      panelType: 'codex',
      agentSessionId: '11111111-2222-3333-4444-555555555555',
      jsonlPath: '/tmp/11111111-2222-3333-4444-555555555555.jsonl',
      lastUserMessage: 'new prompt',
      processRetries: 3,
      terminalStatus: 'idle',
      listeningPorts: [],
      agentSummary: 'new summary',
    });
  });

  it('keeps unchanged terminal, summary, and JSONL fields when the snapshot does not replace them', () => {
    const entry = makeEntry();

    applyStatusPollTabEntryUpdate({
      entry,
      workspaceId: 'ws-new',
      tab: makeTab({ name: 'Explicit name', panelType: 'terminal', lastUserMessage: null }),
      paneTitle: undefined,
      currentProcess: undefined,
      refreshed: {
        sessionId: null,
        jsonlPath: null,
      },
      persistedSessionId: null,
      processRetries: 0,
      terminalChanged: false,
      terminalStatus: 'idle',
      listeningPorts: [],
      summaryChanged: false,
      agentSummary: null,
    });

    expect(entry.tabName).toBe('Explicit name');
    expect(entry.panelType).toBe('terminal');
    expect(entry.currentProcess).toBeUndefined();
    expect(entry.paneTitle).toBeUndefined();
    expect(entry.lastUserMessage).toBeNull();
    expect(entry.processRetries).toBe(0);
    expect(entry.jsonlPath).toBe('/tmp/old.jsonl');
    expect(entry.terminalStatus).toBe('running');
    expect(entry.listeningPorts).toEqual([3000]);
    expect(entry.agentSummary).toBe('old summary');
  });
});
