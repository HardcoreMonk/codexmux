import { buildApprovalPushBody, getApprovalMetadataDetail } from '@/lib/approval-queue';
import { buildStatusPushTitle, type TStatusPushType } from '@/lib/notification-copy';
import type { IConfigData } from '@/lib/config-store';
import type { IStatusWebPushPayload } from '@/lib/runtime/status/web-push-actions';
import type { ITabStatusEntry } from '@/types/status';
import type { IWorkspace } from '@/types/terminal';

export interface IBuildStatusWebPushPayloadInput {
  pushType: TStatusPushType;
  tabId: string;
  entry: ITabStatusEntry;
  workspace?: Pick<IWorkspace, 'name' | 'directories'> | null;
  config: Pick<IConfigData, 'locale' | 'soundOnCompleteEnabled'>;
}

export const buildStatusWebPushPayload = ({
  pushType,
  tabId,
  entry,
  workspace,
  config,
}: IBuildStatusWebPushPayloadInput): IStatusWebPushPayload => {
  const fallbackBody = entry.lastUserMessage?.slice(0, 100) || entry.tabName || tabId;
  const approvalPromptMetadata = pushType === 'needs-input' ? entry.approvalPromptMetadata ?? null : null;
  const approvalMetadata = pushType === 'needs-input'
    ? {
        approvalKind: approvalPromptMetadata?.approvalKind ?? 'unknown',
        promptType: approvalPromptMetadata?.promptType ?? 'unknown',
        riskLevel: approvalPromptMetadata?.riskLevel ?? 'unknown',
        approvalDetail: getApprovalMetadataDetail(approvalPromptMetadata),
      }
    : {};

  return {
    title: buildStatusPushTitle({ pushType, locale: config.locale }),
    body: pushType === 'needs-input'
      ? buildApprovalPushBody({ metadata: approvalPromptMetadata, fallbackText: fallbackBody, locale: config.locale })
      : fallbackBody,
    silent: pushType === 'review' && config.soundOnCompleteEnabled === false,
    tabId,
    workspaceId: entry.workspaceId,
    agentSessionId: entry.agentSessionId ?? null,
    workspaceName: workspace?.name ?? '',
    workspaceDir: workspace?.directories[0] ?? null,
    ...approvalMetadata,
  };
};
