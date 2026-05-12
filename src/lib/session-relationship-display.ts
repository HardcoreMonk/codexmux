import type {
  IAgentSessionRelationship,
  TAgentSessionRelationshipConfidence,
  TAgentSessionRelationshipType,
} from '@/lib/agent-session-relationship';

export type TSessionRelationshipLabelKey = 'fork' | 'subAgent' | 'resume' | 'unknown';
export type TSessionRelationshipTargetKind = 'parent' | 'root';
export type TSessionRelationshipTone = 'agent' | 'blue' | 'green' | 'muted';

export interface ISessionRelationshipDisplay {
  labelKey: TSessionRelationshipLabelKey;
  relationshipType: TAgentSessionRelationshipType;
  confidence: TAgentSessionRelationshipConfidence;
  targetKind: TSessionRelationshipTargetKind;
  targetSessionId: string;
  targetShortId: string;
  tone: TSessionRelationshipTone;
}

const labelKeys: Record<Exclude<TAgentSessionRelationshipType, 'root'>, TSessionRelationshipLabelKey> = {
  fork: 'fork',
  'sub-agent': 'subAgent',
  resume: 'resume',
  unknown: 'unknown',
};

const tones: Record<TSessionRelationshipLabelKey, TSessionRelationshipTone> = {
  fork: 'blue',
  subAgent: 'agent',
  resume: 'green',
  unknown: 'muted',
};

export const shortenRelationshipSessionId = (sessionId: string): string =>
  sessionId.length > 12 ? `${sessionId.slice(0, 10)}...` : sessionId;

export const selectSessionRelationshipDisplay = (
  relationship: IAgentSessionRelationship | null | undefined,
): ISessionRelationshipDisplay | null => {
  if (!relationship || relationship.relationshipType === 'root') return null;

  const labelKey = labelKeys[relationship.relationshipType] ?? 'unknown';
  const targetSessionId = relationship.parentSessionId ?? relationship.rootSessionId;
  const targetKind: TSessionRelationshipTargetKind = relationship.parentSessionId ? 'parent' : 'root';
  if (!targetSessionId || targetSessionId === relationship.sourceSessionId) return null;

  return {
    labelKey,
    relationshipType: relationship.relationshipType,
    confidence: relationship.relationshipConfidence,
    targetKind,
    targetSessionId,
    targetShortId: shortenRelationshipSessionId(targetSessionId),
    tone: tones[labelKey],
  };
};
