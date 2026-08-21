import { describe, expect, it } from 'vitest';

import { buildAgentSessionRelationship } from '@/lib/agent-session-relationship';

describe('agent session relationship projection', () => {
  it('builds a high-confidence root projection when no relationship hints exist', () => {
    expect(buildAgentSessionRelationship({
      providerId: 'codex',
      sessionId: 'session-root',
    })).toEqual({
      providerId: 'codex',
      sourceSessionId: 'session-root',
      parentSessionId: null,
      rootSessionId: 'session-root',
      relationshipType: 'root',
      relationshipConfidence: 'high',
    });
  });

  it('normalizes parent/root hints without keeping raw path or prompt detail', () => {
    const input = {
      providerId: 'codex',
      sessionId: 'session-child',
      sourceSessionId: 'session-child',
      parentSessionId: 'session-parent',
      rootSessionId: 'session-root',
      relationshipType: 'sub-agent',
      rawDetail: 'cwd=/data/projects/secret prompt=do not store this',
    } as Parameters<typeof buildAgentSessionRelationship>[0] & { rawDetail: string };
    const relationship = buildAgentSessionRelationship(input);

    expect(relationship).toEqual({
      providerId: 'codex',
      sourceSessionId: 'session-child',
      parentSessionId: 'session-parent',
      rootSessionId: 'session-root',
      relationshipType: 'sub-agent',
      relationshipConfidence: 'high',
    });
    expect(JSON.stringify(relationship)).not.toContain('/data/projects/secret');
    expect(JSON.stringify(relationship)).not.toContain('do not store');
  });

  it('keeps incomplete parent hints as unknown with medium confidence', () => {
    expect(buildAgentSessionRelationship({
      providerId: 'codex',
      sessionId: 'session-child',
      parentSessionId: 'session-parent',
    })).toMatchObject({
      parentSessionId: 'session-parent',
      rootSessionId: 'session-child',
      relationshipType: 'unknown',
      relationshipConfidence: 'medium',
    });
  });
});
