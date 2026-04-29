import { describe, expect, it } from 'vitest';

import {
  appendTimelineEntries,
  mergeTimelineInitEntries,
  prependUniqueTimelineEntries,
} from '@/lib/timeline-entry-merge';
import type { ITimelineEntry } from '@/types/timeline';

const user = (id: string, text: string, pending = false): ITimelineEntry => ({
  id,
  type: 'user-message',
  timestamp: 1_800_000_000_000,
  text,
  ...(pending ? { pending: true } : {}),
});

const assistant = (id: string, markdown: string): ITimelineEntry => ({
  id,
  type: 'assistant-message',
  timestamp: 1_800_000_000_100,
  markdown,
});

describe('timeline entry merge', () => {
  it('preserves optimistic user ids when init confirms the same prompt', () => {
    const merged = mergeTimelineInitEntries(
      [user('pending-1', '진행', true)],
      [user('server-1', '진행')],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('pending-1');
  });

  it('skips duplicate assistant appends even when ids were regenerated', () => {
    const entries = appendTimelineEntries(
      [assistant('a', '완료')],
      [assistant('b', '완료')],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('a');
  });

  it('skips paired assistant appends when timestamps differ by milliseconds', () => {
    const entries = appendTimelineEntries(
      [assistant('a', '진행 중')],
      [{ ...assistant('b', '진행 중'), timestamp: 1_800_000_000_101 }],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('a');
  });

  it('updates pending tool-call status when tool result arrives', () => {
    const entries = appendTimelineEntries([
      {
        id: 'tool-call',
        type: 'tool-call',
        timestamp: 1,
        toolUseId: 'call-1',
        toolName: 'exec_command',
        summary: '$ test',
        status: 'pending',
      },
    ], [
      {
        id: 'tool-result',
        type: 'tool-result',
        timestamp: 2,
        toolUseId: 'call-1',
        isError: false,
        summary: 'ok',
      },
    ]);

    expect(entries[0]).toMatchObject({ type: 'tool-call', status: 'success' });
    expect(entries).toHaveLength(2);
  });

  it('prepends only history entries that are not already present', () => {
    const current = [assistant('current', '현재')];
    const older = assistant('older', '이전');

    expect(prependUniqueTimelineEntries(current, [
      assistant('overlap', '현재'),
      older,
    ])).toEqual([older, ...current]);
  });
});
