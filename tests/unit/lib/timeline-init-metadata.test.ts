import { describe, expect, it } from 'vitest';

import {
  computeTimelineInitMeta,
  findLastTimelineUserMessage,
} from '@/lib/timeline/init-metadata';
import type { ITimelineEntry } from '@/types/timeline';

describe('timeline init metadata helpers', () => {
  it('computes init metadata from entries and first timestamp override', () => {
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'first' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
      { id: 'u2', type: 'user-message', timestamp: 3000, text: 'second' },
    ];

    expect(computeTimelineInitMeta({
      entries,
      fileSize: 123,
      firstTimestamp: '2026-05-06T00:00:00.000Z',
      customTitle: 'Session title',
    })).toEqual({
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:03.000Z',
      lastTimestamp: 3000,
      fileSize: 123,
      userCount: 2,
      assistantCount: 1,
      customTitle: 'Session title',
    });
  });

  it('falls back to null timestamps for empty entry sets', () => {
    expect(computeTimelineInitMeta({ entries: [], fileSize: 0 })).toEqual({
      createdAt: null,
      updatedAt: null,
      lastTimestamp: 0,
      fileSize: 0,
      userCount: 0,
      assistantCount: 0,
    });
  });

  it('returns the last user message and truncates long text', () => {
    const longText = 'x'.repeat(240);
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'first' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
      { id: 'u2', type: 'user-message', timestamp: 3000, text: longText },
    ];

    const result = findLastTimelineUserMessage(entries);
    expect(result).toHaveLength(201);
    expect(result?.endsWith('…')).toBe(true);
  });
});
