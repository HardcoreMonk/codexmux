import { describe, expect, it } from 'vitest';

import { shouldEnableAgentStatus } from '@/lib/app-route-state';

describe('shouldEnableAgentStatus', () => {
  it('keeps agent status disabled on the public login route', () => {
    expect(shouldEnableAgentStatus('/login')).toBe(false);
  });

  it('keeps agent status enabled on authenticated app routes', () => {
    expect(shouldEnableAgentStatus('/')).toBe(true);
    expect(shouldEnableAgentStatus('/stats')).toBe(true);
    expect(shouldEnableAgentStatus('/experimental/runtime')).toBe(true);
  });
});
