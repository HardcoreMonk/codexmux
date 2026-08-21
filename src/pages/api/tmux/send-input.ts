import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, sendRawKeys } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';
import {
  appendApprovalAuditEvent,
  type IApprovalAuditEventInput,
} from '@/lib/approval-audit-store';
import type {
  TApprovalKind,
  TApprovalPromptType,
  TApprovalRiskLevel,
} from '@/lib/permission-prompt';

const log = createLogger('tmux');

const promptTypes = new Set<TApprovalPromptType>([
  'command',
  'file',
  'permission',
  'resume-directory',
  'conversation',
  'unknown',
]);
const approvalKinds = new Set<TApprovalKind>(['allow', 'deny', 'trust', 'directory', 'input', 'unknown']);
const riskLevels = new Set<TApprovalRiskLevel>(['low', 'medium', 'high', 'unknown']);

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const readEnum = <T extends string>(value: unknown, allowed: Set<T>): T | undefined =>
  typeof value === 'string' && allowed.has(value as T) ? value as T : undefined;

const readInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

const parseAuditContext = (value: unknown): Omit<IApprovalAuditEventInput, 'eventType' | 'fallbackReason'> | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const workspaceId = readString(data.workspaceId);
  const tabId = readString(data.tabId);
  if (!workspaceId || !tabId) return null;

  return {
    workspaceId,
    tabId,
    promptType: readEnum(data.promptType, promptTypes),
    approvalKind: readEnum(data.approvalKind, approvalKinds),
    riskLevel: readEnum(data.riskLevel, riskLevels),
    selectedOptionIndex: readInteger(data.selectedOptionIndex),
    optionCount: readInteger(data.optionCount),
  };
};

const recordSelectionAudit = async (
  audit: Omit<IApprovalAuditEventInput, 'eventType' | 'fallbackReason'> | null,
  eventType: 'selection-sent' | 'selection-failed',
): Promise<void> => {
  if (!audit) return;
  try {
    await appendApprovalAuditEvent({
      eventType,
      ...audit,
      ...(eventType === 'selection-failed' ? { fallbackReason: 'send-failed' as const } : {}),
    });
  } catch (err) {
    log.warn(`approval selection audit failed: ${err instanceof Error ? err.name : 'unknown error'}`);
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session, input, audit } = req.body as { session?: string; input?: string; audit?: unknown };
  const auditContext = parseAuditContext(audit);

  if (!session || !input) {
    return res.status(400).json({ error: 'session and input parameters required' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    await recordSelectionAudit(auditContext, 'selection-failed');
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await sendRawKeys(session, input);
    await recordSelectionAudit(auditContext, 'selection-sent');
    return res.status(200).json({ ok: true });
  } catch (err) {
    await recordSelectionAudit(auditContext, 'selection-failed');
    log.error(`send-input failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to send input' });
  }
};

export default handler;
