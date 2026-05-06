import { describe, expect, it } from 'vitest';

import { buildStatusWebPushPayload } from '@/lib/status/web-push-payload';
import type { ITabStatusEntry } from '@/types/status';

const makeEntry = (overrides: Partial<ITabStatusEntry> = {}): ITabStatusEntry => ({
  cliState: 'idle',
  workspaceId: 'ws-1',
  tabName: 'Codex tab',
  tmuxSession: 'codexmux:tab',
  agentSessionId: 'session-a',
  ...overrides,
});

describe('status Web Push payload builder', () => {
  it('builds task-complete review payload with fallback body and silent flag', () => {
    const payload = buildStatusWebPushPayload({
      tabId: 'tab-a',
      entry: makeEntry({
        lastUserMessage: 'x'.repeat(120),
      }),
      pushType: 'review',
      workspaceName: 'Workspace A',
      workspaceDir: '/workspace/a',
      soundOnCompleteEnabled: false,
    });

    expect(payload).toEqual({
      title: 'Task Complete',
      body: 'x'.repeat(100),
      silent: true,
      tabId: 'tab-a',
      workspaceId: 'ws-1',
      agentSessionId: 'session-a',
      workspaceName: 'Workspace A',
      workspaceDir: '/workspace/a',
    });
  });

  it('builds needs-input payload with approval metadata detail', () => {
    const payload = buildStatusWebPushPayload({
      tabId: 'tab-a',
      entry: makeEntry({
        lastUserMessage: 'run command',
        approvalPromptMetadata: {
          promptType: 'command',
          approvalKind: 'allow',
          riskLevel: 'high',
          commandPreview: 'rm -rf build',
          fileHints: [],
          fallbackReason: null,
        },
      }),
      pushType: 'needs-input',
      workspaceName: 'Workspace A',
      workspaceDir: null,
      soundOnCompleteEnabled: true,
    });

    expect(payload).toEqual({
      title: 'Input Required',
      body: 'Command approval · high · rm -rf build',
      silent: false,
      tabId: 'tab-a',
      workspaceId: 'ws-1',
      agentSessionId: 'session-a',
      workspaceName: 'Workspace A',
      workspaceDir: null,
      approvalKind: 'allow',
      promptType: 'command',
      riskLevel: 'high',
      approvalDetail: 'rm -rf build',
    });
  });

  it('falls back to tab name then tab id when last user message is absent', () => {
    expect(buildStatusWebPushPayload({
      tabId: 'tab-a',
      entry: makeEntry({
        lastUserMessage: null,
        tabName: 'Named tab',
      }),
      pushType: 'review',
      workspaceName: '',
      workspaceDir: null,
      soundOnCompleteEnabled: true,
    }).body).toBe('Named tab');

    expect(buildStatusWebPushPayload({
      tabId: 'tab-a',
      entry: makeEntry({
        lastUserMessage: null,
        tabName: '',
      }),
      pushType: 'review',
      workspaceName: '',
      workspaceDir: null,
      soundOnCompleteEnabled: true,
    }).body).toBe('tab-a');
  });
});
