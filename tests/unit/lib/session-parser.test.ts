import { describe, expect, it } from 'vitest';

import { parseJsonlContent } from '@/lib/session-parser';

const line = (value: unknown): string => JSON.stringify(value);

describe('parseJsonlContent', () => {
  it('generates stable entry ids from JSONL record identity', () => {
    const content = [
      line({
        type: 'user',
        timestamp: '2026-04-29T10:00:00.000Z',
        message: { role: 'user', content: '작업 시작' },
      }),
      line({
        type: 'assistant',
        timestamp: '2026-04-29T10:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '진행 중' }],
          stop_reason: 'end_turn',
        },
      }),
    ].join('\n');

    const first = parseJsonlContent(content);
    const second = parseJsonlContent(content);

    expect(first).toHaveLength(2);
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
    expect(first.every((entry) => entry.id.startsWith('jsonl-'))).toBe(true);
  });
});
