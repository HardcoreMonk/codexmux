export interface IPushNavigationData {
  workspaceId?: string | null;
  tabId?: string | null;
  agentSessionId?: string | null;
  workspaceName?: string | null;
  workspaceDir?: string | null;
  approvalKind?: string | null;
  promptType?: string | null;
  riskLevel?: string | null;
}

export interface IParsedPushDeepLink {
  workspaceId: string;
  tabId?: string;
  agentSessionId?: string;
  approval: boolean;
}

const getTrimmed = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const buildPushDeepLinkPath = (data: IPushNavigationData): string => {
  const workspaceId = getTrimmed(data.workspaceId);
  if (!workspaceId) return '/';

  const params = new URLSearchParams({ pushWorkspaceId: workspaceId });
  const tabId = getTrimmed(data.tabId);
  const agentSessionId = getTrimmed(data.agentSessionId);
  if (tabId) params.set('pushTabId', tabId);
  if (agentSessionId) params.set('pushAgentSessionId', agentSessionId);
  if (data.approvalKind || data.promptType || data.riskLevel) params.set('pushApproval', '1');

  return `/?${params.toString()}`;
};

export const parsePushDeepLinkSearch = (search: string): IParsedPushDeepLink | null => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const workspaceId = getTrimmed(params.get('pushWorkspaceId'));
  if (!workspaceId) return null;

  const tabId = getTrimmed(params.get('pushTabId'));
  const agentSessionId = getTrimmed(params.get('pushAgentSessionId'));
  return {
    workspaceId,
    ...(tabId ? { tabId } : {}),
    ...(agentSessionId ? { agentSessionId } : {}),
    approval: params.get('pushApproval') === '1',
  };
};

export const hasPushDeepLinkSearch = (search: string): boolean =>
  parsePushDeepLinkSearch(search) !== null;
