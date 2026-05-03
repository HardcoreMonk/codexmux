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

  it('accepts supervisor commands for the target worker namespace', () => {
    expect(validateStorage()).toBeNull();
  });

  it('rejects invalid worker command envelopes with a shared error descriptor', () => {
    const cases = [
      validateStorage({ source: 'browser' }),
      validateStorage({ target: 'terminal' }),
      validateStorage({ type: 'storage.unknown' }),
      validateStorage({ type: 'terminal.health' }),
    ];

    for (const result of cases) {
      expect(result).toMatchObject({
        code: 'invalid-worker-command',
        retryable: false,
      });
    }
  });
});
