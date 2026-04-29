import { describe, expect, it } from 'vitest';

import {
  dedupeTimelineEntries,
  filterUniqueTimelineEntries,
  getTimelineEntryFingerprint,
} from '@/lib/timeline-entry-dedupe';
import type { ITimelineAssistantMessage, ITimelineToolCall } from '@/types/timeline';

const assistantEntry = (
  overrides: Partial<ITimelineAssistantMessage> = {},
): ITimelineAssistantMessage => ({
  id: 'assistant-a',
  type: 'assistant-message',
  timestamp: 1_800_000_000_000,
  markdown: '작업 완료',
  ...overrides,
});

const toolCallEntry = (
  overrides: Partial<ITimelineToolCall> = {},
): ITimelineToolCall => ({
  id: 'tool-a',
  type: 'tool-call',
  timestamp: 1_800_000_000_100,
  toolUseId: 'call-1',
  toolName: 'exec_command',
  summary: '$ git status --short',
  status: 'pending',
  ...overrides,
});

describe('timeline entry dedupe', () => {
  it('dedupes entries with regenerated ids and identical content', () => {
    const entries = dedupeTimelineEntries([
      assistantEntry(),
      assistantEntry({ id: 'assistant-b' }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('assistant-a');
  });

  it('dedupes paired assistant messages with near-identical timestamps', () => {
    const entries = dedupeTimelineEntries([
      assistantEntry(),
      assistantEntry({ id: 'assistant-b', timestamp: 1_800_000_000_001 }),
    ]);

    expect(entries).toHaveLength(1);
  });

  it('keeps repeated content when the source timestamp is outside the duplicate window', () => {
    const entries = dedupeTimelineEntries([
      assistantEntry(),
      assistantEntry({ id: 'assistant-b', timestamp: 1_800_000_002_000 }),
    ]);

    expect(entries).toHaveLength(2);
  });

  it('filters overlapping prepended or appended batches against existing entries', () => {
    const existing = [assistantEntry({ id: 'current' })];
    const candidates = [
      assistantEntry({ id: 'overlap' }),
      assistantEntry({ id: 'older', timestamp: 1_799_999_998_000 }),
    ];

    expect(filterUniqueTimelineEntries(existing, candidates)).toEqual([candidates[1]]);
  });

  it('does not treat mutable tool status as part of identity', () => {
    expect(getTimelineEntryFingerprint(toolCallEntry())).toBe(
      getTimelineEntryFingerprint(toolCallEntry({ id: 'tool-b', status: 'success' })),
    );
  });
});
