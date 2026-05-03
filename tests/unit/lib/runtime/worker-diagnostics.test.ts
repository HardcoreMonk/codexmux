import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRuntimeWorkerDiagnosticsSnapshot,
  recordRuntimeWorkerDiagnostic,
  resetRuntimeWorkerDiagnosticsForTest,
} from '@/lib/runtime/worker-diagnostics';

describe('runtime worker diagnostics', () => {
  beforeEach(() => {
    resetRuntimeWorkerDiagnosticsForTest();
  });

  it('returns zeroed snapshots for every runtime v2 worker', () => {
    const snapshot = getRuntimeWorkerDiagnosticsSnapshot();

    expect(Object.keys(snapshot)).toEqual(['storage', 'terminal', 'timeline', 'status']);
    expect(snapshot.storage).toMatchObject({
      starts: 0,
      readyChecks: 0,
      readyFailures: 0,
      requests: 0,
      replies: 0,
      events: 0,
      commandFailures: 0,
      invalidReplies: 0,
      timeouts: 0,
      sendFailures: 0,
      exits: 0,
      errors: 0,
      restarts: 0,
      shutdowns: 0,
      lastError: null,
      lastExit: null,
    });
  });

  it('records counters and sanitized last error metadata', () => {
    const error = Object.assign(
      new Error('failed in /home/hardcoremonk/project for rtv2-ws-a-pane-b-tab-c'),
      {
        code: 'worker-error',
        retryable: true,
      },
    );

    recordRuntimeWorkerDiagnostic('storage', 'start');
    recordRuntimeWorkerDiagnostic('storage', 'request');
    recordRuntimeWorkerDiagnostic('storage', 'failure', { error });

    const snapshot = getRuntimeWorkerDiagnosticsSnapshot();
    expect(snapshot.storage.starts).toBe(1);
    expect(snapshot.storage.requests).toBe(1);
    expect(snapshot.storage.errors).toBe(1);
    expect(snapshot.storage.lastError).toMatchObject({
      code: 'worker-error',
      retryable: true,
    });
    expect(snapshot.storage.lastError?.message).toContain('[path]');
    expect(snapshot.storage.lastError?.message).toContain('[runtime-session]');
    expect(JSON.stringify(snapshot)).not.toContain('/home/hardcoremonk');
    expect(JSON.stringify(snapshot)).not.toContain('rtv2-ws-a-pane-b-tab-c');
  });
});
