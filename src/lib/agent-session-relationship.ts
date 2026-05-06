export type TAgentSessionRelationshipType = 'root' | 'fork' | 'sub-agent' | 'resume' | 'unknown';
export type TAgentSessionRelationshipConfidence = 'high' | 'medium' | 'low';

export interface IAgentSessionRelationship {
  providerId: string;
  sourceSessionId: string;
  parentSessionId: string | null;
  rootSessionId: string;
  relationshipType: TAgentSessionRelationshipType;
  relationshipConfidence: TAgentSessionRelationshipConfidence;
}

export interface IBuildAgentSessionRelationshipInput {
  providerId: string;
  sessionId: string;
  sourceSessionId?: string | null;
  parentSessionId?: string | null;
  rootSessionId?: string | null;
  relationshipType?: string | null;
}

const relationshipTypes = new Set<TAgentSessionRelationshipType>([
  'root',
  'fork',
  'sub-agent',
  'resume',
  'unknown',
]);

const cleanId = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
};

const normalizeRelationshipType = (
  value: string | null | undefined,
  hasParent: boolean,
  hasRootHint: boolean,
): TAgentSessionRelationshipType => {
  if (value && relationshipTypes.has(value as TAgentSessionRelationshipType)) {
    return value as TAgentSessionRelationshipType;
  }
  if (!hasParent) return 'root';
  return hasRootHint ? 'sub-agent' : 'unknown';
};

const resolveConfidence = (
  relationshipType: TAgentSessionRelationshipType,
  hasParent: boolean,
  hasRootHint: boolean,
): TAgentSessionRelationshipConfidence => {
  if (relationshipType === 'root') return hasParent ? 'medium' : 'high';
  if (relationshipType === 'unknown') return hasParent ? 'medium' : 'low';
  return hasParent && hasRootHint ? 'high' : 'medium';
};

export const buildAgentSessionRelationship = ({
  providerId,
  sessionId,
  sourceSessionId,
  parentSessionId,
  rootSessionId,
  relationshipType,
}: IBuildAgentSessionRelationshipInput): IAgentSessionRelationship => {
  const cleanSessionId = cleanId(sessionId) ?? 'unknown';
  const cleanParentSessionId = cleanId(parentSessionId);
  const cleanRootSessionId = cleanId(rootSessionId);
  const hasParent = !!cleanParentSessionId;
  const hasRootHint = !!cleanRootSessionId;
  const type = normalizeRelationshipType(relationshipType, hasParent, hasRootHint);

  return {
    providerId: cleanId(providerId) ?? 'unknown',
    sourceSessionId: cleanId(sourceSessionId) ?? cleanSessionId,
    parentSessionId: cleanParentSessionId,
    rootSessionId: cleanRootSessionId ?? cleanSessionId,
    relationshipType: type,
    relationshipConfidence: resolveConfidence(type, hasParent, hasRootHint),
  };
};
