import { describe, expect, it } from 'vitest';
import { normalizeSidebarTab } from '@/lib/sidebar-tab';

describe('sidebar tab normalization', () => {
  it.each([
    ['workspace', 'workspace'],
    ['activity', 'activity'],
    ['sessions', 'activity'],
    ['unknown', 'workspace'],
    [undefined, 'workspace'],
    [null, 'workspace'],
  ] as const)('normalizes %s to %s', (raw, expected) => {
    expect(normalizeSidebarTab(raw)).toBe(expected);
  });
});
