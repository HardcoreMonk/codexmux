import { describe, expect, it } from 'vitest';
import {
  createRuntimeId,
  createRuntimeSessionName,
  parseRuntimeSessionName,
} from '@/lib/runtime/session-name';

describe('runtime session names', () => {
  it('generates tmux-safe bounded v2 session names', () => {
    const workspaceId = createRuntimeId('ws');
    const paneId = createRuntimeId('pane');
    const tabId = createRuntimeId('tab');
    const sessionName = createRuntimeSessionName({ workspaceId, paneId, tabId });

    expect(sessionName).toMatch(/^rtv2-[a-z0-9][a-z0-9-]*$/);
    expect(Buffer.byteLength(sessionName)).toBeLessThanOrEqual(120);
  });

  it('normalizes legacy layout ids when generating v2 session names', () => {
    const sessionName = createRuntimeSessionName({
      workspaceId: 'ws-WlO9mw',
      paneId: 'pane-VTYwR4',
      tabId: 'tab-Foo_123',
    });

    expect(sessionName).toBe('rtv2-ws-wlo9mw-pane-vtywr4-tab-foo-123');
    expect(parseRuntimeSessionName(sessionName)).toBe(sessionName);
  });

  it('rejects unsafe or too-long existing session names', () => {
    for (const sessionName of [
      'pt-ws-a-pane-b-tab-c',
      'rtv2-ws-a:pane-b-tab-c',
      'rtv2-ws-a pane-b-tab-c',
      'rtv2-ws-a/pane-b-tab-c',
      'rtv2-Ws-a-pane-b-tab-c',
      `rtv2-${'a'.repeat(200)}`,
    ]) {
      expect(() => parseRuntimeSessionName(sessionName)).toThrow();
    }
  });
});
