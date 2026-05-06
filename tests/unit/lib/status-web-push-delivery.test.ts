import { describe, expect, it, vi } from 'vitest';

import { deliverStatusWebPush } from '@/lib/status/web-push-delivery';
import type {
  IStatusSendWebPushInput,
  IStatusSendWebPushResult,
} from '@/lib/runtime/status/web-push-actions';

const input: IStatusSendWebPushInput = {
  anyDeviceVisible: false,
  payload: {
    title: 'Task Complete',
    body: 'done',
    silent: false,
    tabId: 'tab-a',
    workspaceId: 'ws-1',
    agentSessionId: 'session-a',
    workspaceName: 'Workspace A',
    workspaceDir: '/workspace/a',
  },
};

const result = (overrides: Partial<IStatusSendWebPushResult> = {}): IStatusSendWebPushResult => ({
  skippedVisible: false,
  attempted: 1,
  sent: 1,
  removed: 0,
  failed: 0,
  ...overrides,
});

describe('status Web Push delivery', () => {
  it('uses runtime default delivery and records runtime counters', async () => {
    const runtimeResult = result({ sent: 2, removed: 1, failed: 1, skippedVisible: true });
    const sendRuntime = vi.fn(async () => runtimeResult);
    const sendLegacy = vi.fn(async () => result());
    const recordCounter = vi.fn();

    await expect(deliverStatusWebPush({
      ...input,
      useRuntimeDefault: true,
      sendRuntime,
      sendLegacy,
      recordCounter,
    })).resolves.toEqual(runtimeResult);

    expect(sendRuntime).toHaveBeenCalledWith(input);
    expect(sendLegacy).not.toHaveBeenCalled();
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_web_push.sent', 2);
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_web_push.failed', 1);
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_web_push.removed', 1);
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_web_push.skipped_visible');
  });

  it('falls back to legacy delivery when runtime default send fails', async () => {
    const legacyResult = result({ sent: 1 });
    const sendRuntime = vi.fn(async () => {
      throw new Error('runtime down');
    });
    const sendLegacy = vi.fn(async () => legacyResult);
    const recordCounter = vi.fn();
    const warn = vi.fn();

    await expect(deliverStatusWebPush({
      ...input,
      useRuntimeDefault: true,
      sendRuntime,
      sendLegacy,
      recordCounter,
      warn,
    })).resolves.toEqual(legacyResult);

    expect(sendLegacy).toHaveBeenCalledWith(input);
    expect(recordCounter).toHaveBeenCalledWith('runtime_v2.status_web_push.fallback');
    expect(warn.mock.calls[0]?.[0]).toContain('runtime v2 Web Push send failed');
  });

  it('uses legacy delivery directly outside runtime default mode', async () => {
    const legacyResult = result({ sent: 1 });
    const sendRuntime = vi.fn(async () => result());
    const sendLegacy = vi.fn(async () => legacyResult);

    await expect(deliverStatusWebPush({
      ...input,
      useRuntimeDefault: false,
      sendRuntime,
      sendLegacy,
    })).resolves.toEqual(legacyResult);

    expect(sendRuntime).not.toHaveBeenCalled();
    expect(sendLegacy).toHaveBeenCalledWith(input);
  });
});
