import { describe, expect, it } from 'vitest';

import { buildHookSettings } from '@/lib/hook-settings';

describe('hook settings', () => {
  it('generates supported Codex lifecycle hooks', () => {
    const settings = buildHookSettings();

    expect(settings.hooks).toHaveProperty('SessionStart');
    expect(settings.hooks).toHaveProperty('UserPromptSubmit');
    expect(settings.hooks).toHaveProperty('Stop');
    expect(settings.hooks.Stop[0]?.hooks[0]?.command).toContain('stop');
    expect(settings.hooks).not.toHaveProperty('Notification');
    expect(settings.hooks).not.toHaveProperty('PermissionRequest');
  });
});
