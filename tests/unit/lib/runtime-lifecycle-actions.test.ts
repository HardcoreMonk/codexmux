import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempHome: string;

describe('runtime lifecycle actions', () => {
  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-lifecycle-actions-'));
    vi.resetModules();
    vi.stubEnv('HOME', tempHome);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('runs only allowlisted actions with fixed argv and writes sanitized audit', async () => {
    const executed: Array<{ command: string; args: string[] }> = [];
    const { createLifecycleActionService } = await import('@/lib/runtime/lifecycle-actions');
    const service = createLifecycleActionService({
      execute: async (command, args) => {
        executed.push({ command, args });
        return { exitCode: 0 };
      },
    });

    const result = await service.runAction({ actionId: 'phase6-gate' });

    expect(result.ok).toBe(true);
    expect(executed).toEqual([
      { command: 'corepack', args: ['pnpm', 'smoke:runtime-v2:phase6-default-gate'] },
    ]);
    const events = await service.readAuditEvents({ limit: 10 });
    expect(events[0]).toMatchObject({
      actionId: 'phase6-gate',
      status: 'succeeded',
      exitCode: 0,
      error: null,
    });
  });

  it('rejects guarded actions without the exact confirmation phrase', async () => {
    const { createLifecycleActionService } = await import('@/lib/runtime/lifecycle-actions');
    const service = createLifecycleActionService({
      execute: async () => {
        throw new Error('must not execute');
      },
    });

    const result = await service.runAction({ actionId: 'restart-service', confirmation: 'restart' });

    expect(result.ok).toBe(false);
    expect(result.event).toMatchObject({
      actionId: 'restart-service',
      status: 'rejected',
      exitCode: null,
      error: 'confirmation-required',
    });
  });

  it('blocks concurrent actions and records the rejected request', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    const { createLifecycleActionService } = await import('@/lib/runtime/lifecycle-actions');
    const service = createLifecycleActionService({
      execute: async () => {
        await blocker;
        return { exitCode: 0 };
      },
    });

    const first = service.runAction({ actionId: 'phase6-gate' });
    const second = await service.runAction({ actionId: 'phase6-gate' });
    release();
    await first;

    expect(second.ok).toBe(false);
    expect(second.event).toMatchObject({
      actionId: 'phase6-gate',
      status: 'rejected',
      error: 'action-already-running',
    });
  });

  it('sanitizes failed action errors before persisting them', async () => {
    const { createLifecycleActionService } = await import('@/lib/runtime/lifecycle-actions');
    const service = createLifecycleActionService({
      execute: async () => {
        throw new Error('failed cwd /data/projects/secret x-cmux-token secret-token sessionName rtv2-secret');
      },
    });

    const result = await service.runAction({ actionId: 'phase6-gate' });
    const raw = await fs.readFile(path.join(tempHome, '.codexmux', 'lifecycle-actions.jsonl'), 'utf-8');

    expect(result.ok).toBe(false);
    expect(raw).not.toContain('/data/projects/secret');
    expect(raw).not.toContain('secret-token');
    expect(raw).not.toContain('rtv2-secret');
    expect(raw).toContain('[path]');
    expect(raw).toContain('[secret]');
    expect(raw).toContain('[runtime-session]');
  });
});
