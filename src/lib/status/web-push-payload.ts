import { buildApprovalPushBody, getApprovalMetadataDetail } from '@/lib/approval-queue';
import type { IStatusWebPushPayload } from '@/lib/runtime/status/web-push-actions';
import type { ITabStatusEntry } from '@/types/status';

export type TStatusWebPushType = 'review' | 'needs-input';

interface IBuildStatusWebPushPayloadInput {
  tabId: string;
  entry: Pick<
    ITabStatusEntry,
    'workspaceId' | 'tabName' | 'lastUserMessage' | 'agentSessionId' | 'approvalPromptMetadata'
  >;
  pushType: TStatusWebPushType;
  workspaceName: string;
  workspaceDir: string | null;
  soundOnCompleteEnabled?: boolean;
}

export const buildStatusWebPushPayload = ({
  tabId,
  entry,
  pushType,
  workspaceName,
  workspaceDir,
  soundOnCompleteEnabled,
}: IBuildStatusWebPushPayloadInput): IStatusWebPushPayload => {
  const title = pushType === 'needs-input' ? 'Input Required' : 'Task Complete';
  const fallbackBody = entry.lastUserMessage?.slice(0, 100) || entry.tabName || tabId;
  const approvalPromptMetadata = pushType === 'needs-input' ? entry.approvalPromptMetadata ?? null : null;
  const body = pushType === 'needs-input'
    ? buildApprovalPushBody({ metadata: approvalPromptMetadata, fallbackText: fallbackBody })
    : fallbackBody;
  const payload: IStatusWebPushPayload = {
    title,
    body,
    silent: pushType === 'review' && soundOnCompleteEnabled === false,
    tabId,
    workspaceId: entry.workspaceId,
    agentSessionId: entry.agentSessionId ?? null,
    workspaceName,
    workspaceDir,
  };

  if (pushType === 'needs-input') {
    payload.approvalKind = approvalPromptMetadata?.approvalKind ?? 'unknown';
    payload.promptType = approvalPromptMetadata?.promptType ?? 'unknown';
    payload.riskLevel = approvalPromptMetadata?.riskLevel ?? 'unknown';
    payload.approvalDetail = getApprovalMetadataDetail(approvalPromptMetadata);
  }

  return payload;
};
