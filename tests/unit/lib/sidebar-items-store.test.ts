import { describe, expect, it } from 'vitest';
import {
  BUILTIN_ITEMS,
  BUILTIN_ITEM_LABEL_KEYS,
} from '@/lib/sidebar-items-store';

describe('sidebar builtin items', () => {
  it('includes the localized Session Explorer in desktop and mobile shared data', () => {
    expect(BUILTIN_ITEMS).toContainEqual({
      id: 'builtin-session-explorer',
      name: 'Session Explorer',
      icon: 'Search',
      url: '/sessions',
      enabled: true,
    });
    expect(BUILTIN_ITEM_LABEL_KEYS['builtin-session-explorer']).toBe('sessionExplorer');
  });

  it('includes the localized Project Governance surface', () => {
    expect(BUILTIN_ITEMS).toContainEqual({
      id: 'builtin-governance',
      name: 'Project Governance',
      icon: 'ShieldCheck',
      url: '/governance',
      enabled: true,
    });
    expect(BUILTIN_ITEM_LABEL_KEYS['builtin-governance']).toBe('governance');
  });
});
