import { describe, expect, it } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { createStatusWorkerService } from '@/lib/runtime/status/worker-service';

const command = (type: string, payload: unknown = {}) => createRuntimeCommand({
  id: `cmd-${type}`,
  source: 'supervisor',
  target: 'status',
  type,
  payload,
});

describe('status worker service', () => {
  it('handles health checks', async () => {
    const service = createStatusWorkerService();
    const reply = await service.handleCommand(command('status.health'));

    expect(reply.ok).toBe(true);
    expect(reply.source).toBe('status');
    expect(reply.target).toBe('supervisor');
    expect(reply.payload).toEqual({ ok: true });
  });

  it('keeps Codex stop hooks out of direct ready-for-review transitions', async () => {
    const service = createStatusWorkerService();
    const reply = await service.handleCommand(command('status.reduce-hook-state', {
      currentState: 'busy',
      eventName: 'stop',
      providerId: 'codex',
    }));

    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual({
      nextState: 'busy',
      changed: false,
      deferCodexStop: true,
    });
  });

  it('moves active completed Codex turns to ready-for-review', async () => {
    const service = createStatusWorkerService();
    const reply = await service.handleCommand(command('status.reduce-codex-state', {
      currentState: 'busy',
      running: true,
      hasJsonlPath: true,
      idle: true,
      hasCompletionSnippet: true,
    }));

    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual({
      nextState: 'ready-for-review',
      changed: true,
      silent: false,
      skipHistory: false,
    });
  });

  it('evaluates notification policy with input-request filtering', async () => {
    const service = createStatusWorkerService();
    const reply = await service.handleCommand(command('status.evaluate-notification-policy', {
      eventName: 'notification',
      notificationType: 'permission_prompt',
      newState: 'needs-input',
      silent: false,
    }));

    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual({
      processHookEvent: true,
      sendReviewNotification: false,
      sendNeedsInputNotification: true,
    });
  });
});
