import { describe, expect, it } from 'vitest';
import {
  APP_AREA_ITEMS,
  isCoreAppAreaSidebarItem,
  resolveAppArea,
} from '@/lib/app-navigation';

describe('app navigation', () => {
  it.each([
    ['/', 'workspace'],
    ['/sessions', 'sessions'],
    ['/sessions/replay', 'sessions'],
    ['/governance', 'governance'],
    ['/governance/project', 'governance'],
    ['/reports', null],
    ['/stats', null],
    ['/webview', null],
    ['/sessions-old', null],
  ] as const)('resolves %s to %s', (pathname, expected) => {
    expect(resolveAppArea(pathname)).toBe(expected);
  });

  it('keeps the primary areas fixed and ordered', () => {
    expect(APP_AREA_ITEMS.map((item) => item.id)).toEqual([
      'workspace',
      'sessions',
      'governance',
    ]);
  });

  it('recognizes only core sidebar duplicates', () => {
    expect(isCoreAppAreaSidebarItem('builtin-session-explorer')).toBe(true);
    expect(isCoreAppAreaSidebarItem('builtin-governance')).toBe(true);
    expect(isCoreAppAreaSidebarItem('builtin-notes')).toBe(false);
    expect(isCoreAppAreaSidebarItem('custom-session-link')).toBe(false);
  });
});
