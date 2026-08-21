import { describe, expect, it } from 'vitest';

import { buildTimelineInitMeta } from '@/lib/timeline-init-meta';
import type { ITimelineEntry } from '@/types/timeline';

describe('buildTimelineInitMeta', () => {
  it('counts user and assistant messages and keeps the latest timestamp', () => {
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'Start' },
      { id: 't1', type: 'thinking', timestamp: 1500, thinking: 'Reasoning' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'Done' },
      { id: 'u2', type: 'user-message', timestamp: 2500, text: 'Next' },
    ];

    expect(buildTimelineInitMeta(entries, 1234)).toEqual({
      createdAt: new Date(1000).toISOString(),
      updatedAt: new Date(2500).toISOString(),
      lastTimestamp: 2500,
      fileSize: 1234,
      userCount: 2,
      assistantCount: 1,
      customTitle: undefined,
    });
  });

  it('prefers a supplied createdAt override and preserves custom title', () => {
    expect(buildTimelineInitMeta(
      [{ id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'Done' }],
      99,
      '2026-05-08T00:00:00.000Z',
      'Fixture title',
    )).toMatchObject({
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: new Date(2000).toISOString(),
      customTitle: 'Fixture title',
    });
  });
});
