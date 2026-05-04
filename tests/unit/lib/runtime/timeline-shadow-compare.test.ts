import { describe, expect, it } from 'vitest';
import {
  compareRuntimeTimelineEntries,
  compareRuntimeTimelineMessageCounts,
} from '@/lib/runtime/timeline-shadow-compare';

describe('runtime v2 timeline shadow compare', () => {
  it('compares message counts and tool breakdowns', () => {
    expect(compareRuntimeTimelineMessageCounts(
      { userCount: 1, assistantCount: 2, toolCount: 1, toolBreakdown: { exec_command: 1 } },
      { userCount: 1, assistantCount: 2, toolCount: 1, toolBreakdown: { exec_command: 1 } },
    )).toEqual({ ok: true, mismatches: [] });

    expect(compareRuntimeTimelineMessageCounts(
      { userCount: 1, assistantCount: 2, toolCount: 1, toolBreakdown: { exec_command: 1 } },
      { userCount: 2, assistantCount: 2, toolCount: 1, toolBreakdown: { shell: 1 } },
    )).toEqual({
      ok: false,
      mismatches: [
        { type: 'message-count-field-mismatch', field: 'userCount', expected: 1, actual: 2 },
        { type: 'tool-breakdown-mismatch', toolName: 'exec_command', expected: 1, actual: 0 },
        { type: 'tool-breakdown-mismatch', toolName: 'shell', expected: 0, actual: 1 },
      ],
    });
  });

  it('compares entry metadata without exposing entry content', () => {
    const result = compareRuntimeTimelineEntries(
      {
        entries: [
          { id: 'a', type: 'user-message', content: 'secret prompt' },
          { id: 'b', type: 'assistant-message', content: 'secret answer' },
        ],
        startByteOffset: 10,
        hasMore: false,
      },
      {
        entries: [
          { id: 'c', type: 'user-message', content: 'different secret' },
          { id: 'd', type: 'tool-call', content: 'different secret' },
        ],
        startByteOffset: 20,
        hasMore: true,
      },
    );

    expect(result).toEqual({
      ok: false,
      mismatches: [
        { type: 'entries-field-mismatch', field: 'startByteOffset', expected: 10, actual: 20 },
        { type: 'entries-field-mismatch', field: 'hasMore', expected: false, actual: true },
        { type: 'entry-type-mismatch', index: 1, expected: 'assistant-message', actual: 'tool-call' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
