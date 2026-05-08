import { describe, expect, it } from 'vitest';

import {
  extractAssistantInfoFromJsonlLines,
  scanStatusJsonlLines,
} from '@/lib/status-jsonl-scan';

const line = (value: unknown): string => JSON.stringify(value);

describe('status JSONL scan helpers', () => {
  it('extracts the latest assistant text as a current action summary', () => {
    const result = extractAssistantInfoFromJsonlLines([
      line({
        type: 'assistant',
        timestamp: '2026-05-08T00:00:00.000Z',
        message: {
          content: [{ type: 'text', text: 'Ready for review' }],
        },
      }),
    ]);

    expect(result).toEqual({
      lastAssistantSnippet: 'Ready for review',
      currentAction: { toolName: null, summary: 'Ready for review' },
      reset: false,
    });
  });

  it('resets assistant metadata when a newer user message exists', () => {
    const result = extractAssistantInfoFromJsonlLines([
      line({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Old answer' }] },
      }),
      line({
        type: 'user',
        message: { content: [{ type: 'text', text: 'New request' }] },
      }),
    ]);

    expect(result).toEqual({
      lastAssistantSnippet: null,
      currentAction: null,
      reset: true,
    });
  });

  it('marks interrupted user records as idle and interrupted', () => {
    const result = scanStatusJsonlLines([
      line({
        type: 'user',
        timestamp: '2026-05-08T00:00:00.000Z',
        message: {
          content: [{ type: 'text', text: '[Request interrupted by user]' }],
        },
      }),
    ], 1_000);

    expect(result).toMatchObject({
      matched: true,
      idle: true,
      stale: false,
      interrupted: true,
    });
    expect(result.lastEntryTs).toBe(new Date('2026-05-08T00:00:00.000Z').getTime());
  });

  it('keeps a recent assistant record without stop_reason stale until interrupted threshold passes', () => {
    expect(scanStatusJsonlLines([
      line({
        type: 'assistant',
        timestamp: '2026-05-08T00:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Working' }] },
      }),
    ], 1_000)).toMatchObject({
      matched: true,
      idle: false,
      stale: true,
      needsStaleRecheck: true,
      staleMs: 20_000,
    });

    expect(scanStatusJsonlLines([
      line({
        type: 'assistant',
        timestamp: '2026-05-08T00:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Working' }] },
      }),
    ], 21_000)).toMatchObject({
      matched: true,
      idle: true,
      stale: true,
      needsStaleRecheck: false,
      staleMs: 20_000,
    });
  });
});
