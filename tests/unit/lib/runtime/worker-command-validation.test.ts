import { describe, expect, it } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope } from '@/lib/runtime/worker-command-validation';

describe('validateWorkerCommandEnvelope', () => {
  const validateStorage = (overrides: Partial<Parameters<typeof createRuntimeCommand>[0]> = {}) =>
    validateWorkerCommandEnvelope(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.health',
      payload: {},
      ...overrides,
    }), {
      workerName: 'storage',
      namespace: 'storage',
    });

  const validateTimeline = (overrides: Partial<Parameters<typeof createRuntimeCommand>[0]> = {}) =>
    validateWorkerCommandEnvelope(createRuntimeCommand({
      source: 'supervisor',
      target: 'timeline',
      type: 'timeline.health',
      payload: {},
      ...overrides,
    }), {
      workerName: 'timeline',
      namespace: 'timeline',
    });

  const validateStatus = (overrides: Partial<Parameters<typeof createRuntimeCommand>[0]> = {}) =>
    validateWorkerCommandEnvelope(createRuntimeCommand({
      source: 'supervisor',
      target: 'status',
      type: 'status.health',
      payload: {},
      ...overrides,
    }), {
      workerName: 'status',
      namespace: 'status',
    });

  it('accepts supervisor commands for the target worker namespace', () => {
    expect(validateStorage()).toBeNull();
    expect(validateTimeline()).toBeNull();
    expect(validateStatus()).toBeNull();
  });

  it('rejects invalid worker command envelopes with a shared error descriptor', () => {
    const cases = [
      validateStorage({ source: 'browser' }),
      validateStorage({ target: 'terminal' }),
      validateStorage({ type: 'storage.unknown' }),
      validateStorage({ type: 'terminal.health' }),
      validateTimeline({ type: 'storage.health' }),
      validateStatus({ type: 'timeline.health' }),
    ];

    for (const result of cases) {
      expect(result).toMatchObject({
        code: 'invalid-worker-command',
        retryable: false,
      });
    }
  });
});
