import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cli-token', () => ({ getCliToken: () => 'test-token' }));

import {
  buildCodexSessionHookConfigs,
  createCodexHookCapability,
  verifyCodexHookCapability,
} from '@/lib/providers/codex/session-hooks';

describe('Codex session hooks', () => {
  beforeEach(() => vi.useRealTimers());

  it('signs capabilities for one tab and session with an expiry', () => {
    const capability = createCodexHookCapability('tab-a', 'session-a', 1_000);
    expect(verifyCodexHookCapability(capability, 'session-a', 2_000)).toMatchObject({
      tabId: 'tab-a',
      sessionName: 'session-a',
    });
    expect(verifyCodexHookCapability(capability, 'session-b', 2_000)).toBeNull();
    expect(verifyCodexHookCapability(`${capability}x`, 'session-a', 2_000)).toBeNull();
    expect(verifyCodexHookCapability(capability, 'session-a', 40 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('builds native session-layer handlers for POSIX and Windows', () => {
    const configs = buildCodexSessionHookConfigs({
      tabId: 'tab-a',
      sessionName: 'session-a',
      nodePath: 'C:\\Program Files\\node.exe',
    });
    expect(configs).toHaveLength(3);
    expect(configs[0]).toContain('hooks.SessionStart');
    expect(configs[0]).toContain('commandWindows=');
    expect(configs[0]).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(configs[0]).toContain('set \\"ELECTRON_RUN_AS_NODE=1\\" &&');
    expect(configs[0]).toContain('timeout=3');
    expect(configs[1]).toContain('hooks.UserPromptSubmit');
    expect(configs[2]).toContain('hooks.Stop');
  });
});
