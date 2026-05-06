import { describe, expect, it } from 'vitest';

import {
  buildEmptyTimelineInitMessage,
  buildTimelineInitMessage,
} from '@/lib/timeline/init-message';
import type { IAgentSessionRelationship } from '@/lib/agent-session-relationship';
import type { IChunkReadResult, ISessionStats, ITimelineEntry } from '@/types/timeline';

describe('timeline init message helpers', () => {
  it('builds empty init messages without optional fields unless requested', () => {
    expect(buildEmptyTimelineInitMessage({ sessionId: 'session-1' })).toEqual({
      type: 'timeline:init',
      entries: [],
      sessionId: 'session-1',
      totalEntries: 0,
      startByteOffset: 0,
      hasMore: false,
    });

    expect(buildEmptyTimelineInitMessage({
      sessionId: '',
      jsonlPath: '/tmp/session.jsonl',
      isAgentStarting: true,
    })).toMatchObject({
      jsonlPath: '/tmp/session.jsonl',
      isAgentStarting: true,
    });
  });

  it('builds populated init messages with metadata, summary, and stats', () => {
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'hello' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
    ];
    const result: IChunkReadResult = {
      entries,
      startByteOffset: 42,
      fileSize: 200,
      hasMore: true,
      errorCount: 0,
      summary: 'Existing summary',
      customTitle: 'Custom title',
    };
    const sessionStats: ISessionStats = {
      sessionId: 'session-1',
      inputTokens: 10,
      outputTokens: 20,
    };

    expect(buildTimelineInitMessage({
      result,
      sessionId: 'session-1',
      jsonlPath: '/tmp/session.jsonl',
      firstTimestamp: '2026-05-06T00:00:00.000Z',
      sessionStats,
    })).toEqual({
      type: 'timeline:init',
      entries,
      sessionId: 'session-1',
      totalEntries: 2,
      startByteOffset: 42,
      hasMore: true,
      jsonlPath: '/tmp/session.jsonl',
      summary: 'Existing summary',
      meta: {
        createdAt: '2026-05-06T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:02.000Z',
        lastTimestamp: 2000,
        fileSize: 200,
        userCount: 1,
        assistantCount: 1,
        customTitle: 'Custom title',
      },
      sessionStats,
    });
  });

  it('includes read-only session relationship metadata when provided', () => {
    const relationship: IAgentSessionRelationship = {
      providerId: 'codex',
      sourceSessionId: 'child-session',
      parentSessionId: 'parent-session',
      rootSessionId: 'root-session',
      relationshipType: 'sub-agent',
      relationshipConfidence: 'high',
    };
    const result: IChunkReadResult = {
      entries: [],
      startByteOffset: 0,
      fileSize: 0,
      hasMore: false,
      errorCount: 0,
    };

    expect(buildTimelineInitMessage({
      result,
      sessionId: 'child-session',
      jsonlPath: '/tmp/session.jsonl',
      relationship,
    })).toMatchObject({
      type: 'timeline:init',
      sessionId: 'child-session',
      relationship,
    });
  });
});
