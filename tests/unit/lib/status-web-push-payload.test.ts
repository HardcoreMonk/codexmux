import { describe, expect, it } from 'vitest';
import { buildStatusWebPushPayload } from '@/lib/status-web-push-payload';
import type { ITabStatusEntry } from '@/types/status';

const baseEntry: ITabStatusEntry = {
  cliState: 'needs-input',
  workspaceId: 'ws-1',
  tabName: 'codex',
  tmuxSession: 'pt-ws-pane-tab',
  agentSessionId: 'agent-1',
  lastUserMessage: '테스트 실행 승인',
};

describe('status web push payload', () => {
  it('builds locale-aware needs-input approval payload from sanitized metadata', () => {
    const payload = buildStatusWebPushPayload({
      pushType: 'needs-input',
      tabId: 'tab-1',
      entry: {
        ...baseEntry,
        approvalPromptMetadata: {
          promptType: 'command',
          approvalKind: 'allow',
          riskLevel: 'medium',
          commandPreview: 'corepack pnpm test',
          fileHints: [],
          fallbackReason: null,
        },
      },
      workspace: { name: 'Workspace', directories: ['D:\\work\\repo'] },
      config: { locale: 'ko', soundOnCompleteEnabled: true },
    });

    expect(payload).toEqual({
      title: '입력 필요',
      body: '명령 승인 · 보통 · corepack pnpm test',
      silent: false,
      tabId: 'tab-1',
      workspaceId: 'ws-1',
      agentSessionId: 'agent-1',
      workspaceName: 'Workspace',
      workspaceDir: 'D:\\work\\repo',
      approvalKind: 'allow',
      promptType: 'command',
      riskLevel: 'medium',
      approvalDetail: 'corepack pnpm test',
    });
  });

  it('builds completion payload without approval fields', () => {
    const payload = buildStatusWebPushPayload({
      pushType: 'review',
      tabId: 'tab-2',
      entry: {
        ...baseEntry,
        cliState: 'ready-for-review',
        workspaceId: 'ws-2',
        agentSessionId: null,
        lastUserMessage: 'Review this change',
      },
      workspace: null,
      config: { locale: 'en', soundOnCompleteEnabled: false },
    });

    expect(payload).toMatchObject({
      title: 'Task Complete',
      body: 'Review this change',
      silent: true,
      tabId: 'tab-2',
      workspaceId: 'ws-2',
      agentSessionId: null,
      workspaceName: '',
      workspaceDir: null,
    });
    expect(payload).not.toHaveProperty('approvalKind');
    expect(payload).not.toHaveProperty('promptType');
    expect(payload).not.toHaveProperty('riskLevel');
    expect(payload).not.toHaveProperty('approvalDetail');
  });
});
