import { describe, expect, it } from 'vitest';
import {
  buildPushDeepLinkPath,
  parsePushDeepLinkSearch,
} from '@/lib/push-deep-link';

describe('push deep link helpers', () => {
  it('builds a root deep link from routing ids without sensitive workspace detail', () => {
    const path = buildPushDeepLinkPath({
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      agentSessionId: 'agent-1',
      workspaceName: 'Secret Workspace',
      workspaceDir: '/home/user/private-project',
      approvalKind: 'allow',
      promptType: 'command',
      riskLevel: 'high',
    });

    expect(path).toBe('/?pushWorkspaceId=ws-1&pushTabId=tab-1&pushAgentSessionId=agent-1&pushApproval=1');
    expect(path).not.toContain('Secret Workspace');
    expect(path).not.toContain('/home/user/private-project');
    expect(path).not.toContain('command');
  });

  it('parses push deep link query params and rejects links without a workspace id', () => {
    expect(parsePushDeepLinkSearch('?pushWorkspaceId=ws-1&pushTabId=tab-1&pushAgentSessionId=agent-1&pushApproval=1')).toEqual({
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      agentSessionId: 'agent-1',
      approval: true,
    });
    expect(parsePushDeepLinkSearch('?pushTabId=tab-1')).toBeNull();
  });
});
