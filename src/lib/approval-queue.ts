import type {
  IApprovalPromptMetadata,
  TApprovalPromptType,
  TApprovalRiskLevel,
} from '@/lib/permission-prompt';
import { normalizeLocale, type TSupportedLocale } from '@/lib/locales';

export type TApprovalFallbackReason =
  | 'no-session'
  | 'capture-empty'
  | 'parse-empty'
  | 'send-failed'
  | 'request-failed';

const APPROVAL_PROMPT_TYPE_KEYS: Record<TApprovalPromptType, string> = {
  command: 'approvalType_command',
  file: 'approvalType_file',
  permission: 'approvalType_permission',
  'resume-directory': 'approvalType_resumeDirectory',
  conversation: 'approvalType_conversation',
  unknown: 'approvalType_unknown',
};

const APPROVAL_RISK_KEYS: Record<TApprovalRiskLevel, string> = {
  high: 'approvalRisk_high',
  medium: 'approvalRisk_medium',
  low: 'approvalRisk_low',
  unknown: 'approvalRisk_unknown',
};

const APPROVAL_FALLBACK_KEYS: Record<TApprovalFallbackReason, string> = {
  'no-session': 'approvalFallback_noSession',
  'capture-empty': 'approvalFallback_captureEmpty',
  'parse-empty': 'approvalFallback_parseEmpty',
  'send-failed': 'approvalFallback_sendFailed',
  'request-failed': 'approvalFallback_requestFailed',
};

const APPROVAL_PUSH_TYPE_LABELS: Record<TSupportedLocale, Record<TApprovalPromptType, string>> = {
  ko: {
    command: '명령 승인',
    file: '파일 승인',
    permission: '권한 승인',
    'resume-directory': '디렉터리 선택',
    conversation: '대화 선택',
    unknown: '입력 필요',
  },
  en: {
    command: 'Command approval',
    file: 'File approval',
    permission: 'Permission approval',
    'resume-directory': 'Directory approval',
    conversation: 'Conversation choice',
    unknown: 'Input required',
  },
};

const APPROVAL_PUSH_RISK_LABELS: Record<TSupportedLocale, Record<TApprovalRiskLevel, string>> = {
  ko: {
    high: '높음',
    medium: '보통',
    low: '낮음',
    unknown: '확인 필요',
  },
  en: {
    high: 'high',
    medium: 'medium',
    low: 'low',
    unknown: 'unknown',
  },
};

export const cleanApprovalOptionLabel = (label: string): string =>
  label.replace(/^\d+\.\s+/, '').trim();

export const hasUsableApprovalOptions = (options: string[]): boolean =>
  options.some((option) => option.trim().length > 0);

export const shouldRetryApprovalOptions = ({
  options,
  attempt,
  maxAttempts,
}: {
  options: string[];
  attempt: number;
  maxAttempts: number;
}): boolean => !hasUsableApprovalOptions(options) && attempt < maxAttempts - 1;

export const getApprovalQueueFallbackText = (input: {
  lastUserMessage?: string | null;
  tabName: string;
}): string => {
  const prompt = input.lastUserMessage?.trim();
  return prompt || input.tabName;
};

export const getApprovalPromptTypeKey = (type: TApprovalPromptType | string): string =>
  APPROVAL_PROMPT_TYPE_KEYS[type as TApprovalPromptType] ?? APPROVAL_PROMPT_TYPE_KEYS.unknown;

export const getApprovalRiskKey = (risk: TApprovalRiskLevel | string): string =>
  APPROVAL_RISK_KEYS[risk as TApprovalRiskLevel] ?? APPROVAL_RISK_KEYS.unknown;

export const getApprovalFallbackKey = (reason: TApprovalFallbackReason | string): string =>
  APPROVAL_FALLBACK_KEYS[reason as TApprovalFallbackReason] ?? APPROVAL_FALLBACK_KEYS['request-failed'];

export const getApprovalMetadataDetail = (metadata: IApprovalPromptMetadata | null): string | null => {
  const commandPreview = metadata?.commandPreview?.trim();
  if (commandPreview) return commandPreview;

  const fileHints = metadata?.fileHints ?? [];
  if (fileHints.length === 0) return null;

  const visibleHints = fileHints.slice(0, 3).join(', ');
  const remainingCount = fileHints.length - 3;
  return remainingCount > 0 ? `${visibleHints} +${remainingCount}` : visibleHints;
};

const hasUsefulApprovalMetadata = (metadata: IApprovalPromptMetadata | null): boolean => {
  if (!metadata) return false;
  if (metadata.promptType !== 'unknown') return true;
  if (metadata.approvalKind !== 'unknown') return true;
  if (metadata.riskLevel !== 'unknown') return true;
  return getApprovalMetadataDetail(metadata) !== null;
};

export const selectApprovalPromptMetadata = ({
  fetchedMetadata,
  statusMetadata,
}: {
  fetchedMetadata: IApprovalPromptMetadata | null;
  statusMetadata: IApprovalPromptMetadata | null;
}): IApprovalPromptMetadata | null => {
  if (hasUsefulApprovalMetadata(fetchedMetadata)) return fetchedMetadata;
  if (hasUsefulApprovalMetadata(statusMetadata)) return statusMetadata;
  return fetchedMetadata ?? statusMetadata ?? null;
};

export const buildApprovalPushBody = ({
  metadata,
  fallbackText,
  maxLength = 120,
  locale,
}: {
  metadata: IApprovalPromptMetadata | null;
  fallbackText: string;
  maxLength?: number;
  locale?: string | null;
}): string => {
  const fallback = fallbackText.trim();
  if (!metadata || metadata.promptType === 'unknown') return fallback.slice(0, maxLength);

  const resolvedLocale = normalizeLocale(locale);
  const detail = getApprovalMetadataDetail(metadata);
  const parts = [
    APPROVAL_PUSH_TYPE_LABELS[resolvedLocale][metadata.promptType],
    metadata.riskLevel !== 'unknown' ? APPROVAL_PUSH_RISK_LABELS[resolvedLocale][metadata.riskLevel] : null,
    detail,
  ].filter((part): part is string => !!part && part.trim().length > 0);

  const body = parts.join(' · ');
  return (body || fallback).slice(0, maxLength);
};
