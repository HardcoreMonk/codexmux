import { describe, expect, it } from 'vitest';

import {
  selectSessionRelationshipDisplay,
  shortenRelationshipSessionId,
} from '@/lib/session-relationship-display';
import type { IAgentSessionRelationship } from '@/lib/agent-session-relationship';

const relationship = (
  overrides: Partial<IAgentSessionRelationship> = {},
): IAgentSessionRelationship => ({
  providerId: 'codex',
  sourceSessionId: 'child-session-1234567890',
  parentSessionId: 'parent-session-1234567890',
  rootSessionId: 'root-session-1234567890',
  relationshipType: 'sub-agent',
  relationshipConfidence: 'high',
  ...overrides,
});

describe('session relationship display helpers', () => {
  it('does not display missing or root relationships', () => {
    expect(selectSessionRelationshipDisplay(null)).toBeNull();
    expect(selectSessionRelationshipDisplay(relationship({
      parentSessionId: null,
      rootSessionId: 'child-session-1234567890',
      relationshipType: 'root',
    }))).toBeNull();
  });

  it('selects parent target display for sub-agent and fork relationships', () => {
    expect(selectSessionRelationshipDisplay(relationship())).toEqual({
      labelKey: 'subAgent',
      relationshipType: 'sub-agent',
      confidence: 'high',
      targetKind: 'parent',
      targetSessionId: 'parent-session-1234567890',
      targetShortId: 'parent-ses...',
      tone: 'agent',
    });

    expect(selectSessionRelationshipDisplay(relationship({
      relationshipType: 'fork',
      relationshipConfidence: 'medium',
    }))).toMatchObject({
      labelKey: 'fork',
      confidence: 'medium',
      targetKind: 'parent',
      tone: 'blue',
    });
  });

  it('falls back to root target when parent is missing', () => {
    expect(selectSessionRelationshipDisplay(relationship({
      parentSessionId: null,
      relationshipType: 'resume',
    }))).toMatchObject({
      labelKey: 'resume',
      targetKind: 'root',
      targetSessionId: 'root-session-1234567890',
      targetShortId: 'root-sessi...',
      tone: 'green',
    });
  });

  it('preserves unknown low-confidence relationships without raw metadata', () => {
    const display = selectSessionRelationshipDisplay(relationship({
      relationshipType: 'unknown',
      relationshipConfidence: 'low',
      parentSessionId: 'parent-session',
      rootSessionId: 'root-session',
    }));

    expect(display).toEqual({
      labelKey: 'unknown',
      relationshipType: 'unknown',
      confidence: 'low',
      targetKind: 'parent',
      targetSessionId: 'parent-session',
      targetShortId: 'parent-ses...',
      tone: 'muted',
    });
    expect(JSON.stringify(display)).not.toContain('/work/project');
    expect(JSON.stringify(display)).not.toContain('rm -rf');
  });

  it('shortens long ids but leaves compact ids readable', () => {
    expect(shortenRelationshipSessionId('short-id')).toBe('short-id');
    expect(shortenRelationshipSessionId('1234567890abcdef')).toBe('1234567890...');
  });
});
