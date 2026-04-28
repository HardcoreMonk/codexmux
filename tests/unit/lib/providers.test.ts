import { describe, expect, it } from 'vitest';

import { normalizePanelType } from '@/lib/panel-type';
import { getProviderByPanelType, listProviders } from '@/lib/providers';

describe('agent providers', () => {
  it('registers only Codex as a runtime provider', () => {
    expect(listProviders().map((provider) => provider.id)).toEqual(['codex']);
  });

  it('maps only the Codex panel type to the Codex provider', () => {
    expect(getProviderByPanelType('codex')?.id).toBe('codex');
    expect(getProviderByPanelType('terminal')).toBeNull();
    expect(normalizePanelType('codex')).toBe('codex');
    expect(normalizePanelType('unknown-panel')).toBeUndefined();
  });
});
