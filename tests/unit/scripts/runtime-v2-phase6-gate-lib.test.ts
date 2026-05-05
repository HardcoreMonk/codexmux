import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/runtime-v2-phase6-gate-lib.mjs')).href);

const healthyWorker = (): Record<string, unknown> => ({
  starts: 1,
  healthChecks: 1,
  healthFailures: 0,
  readyChecks: 1,
  readyFailures: 0,
  requests: 1,
  replies: 1,
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
});

const healthySnapshot = () => ({
  health: {
    ok: true,
    storage: { ok: true },
    terminal: { ok: true },
    timeline: { ok: true },
    status: { ok: true },
    terminalV2Mode: 'new-tabs',
    storageV2Mode: 'default',
    timelineV2Mode: 'default',
    statusV2Mode: 'default',
  },
  perf: {
    services: {
      runtimeWorkers: {
        storage: healthyWorker(),
        terminal: healthyWorker(),
        timeline: healthyWorker(),
        status: healthyWorker(),
      },
    },
  },
});

describe('runtime v2 phase 6 default gate helpers', () => {
  it('accepts full default modes with healthy workers and zero failure counters', async () => {
    const { validateRuntimeV2Phase6Gate } = await loadLib();

    expect(validateRuntimeV2Phase6Gate(healthySnapshot())).toEqual({
      ok: true,
      checks: [
        'runtime-health-ok',
        'terminal-mode-new-tabs',
        'storage-mode-default',
        'timeline-mode-default',
        'status-mode-default',
        'storage-health-ok',
        'terminal-health-ok',
        'timeline-health-ok',
        'status-health-ok',
        'worker-diagnostics-present',
        'worker-counters-clean',
      ],
      failures: [],
    });
  });

  it('reports mode and worker counter failures without copying raw diagnostic payloads', async () => {
    const { validateRuntimeV2Phase6Gate } = await loadLib();
    const snapshot = healthySnapshot();
    snapshot.health.statusV2Mode = 'shadow';
    snapshot.perf.services.runtimeWorkers.status.restarts = 1;
    snapshot.perf.services.runtimeWorkers.status.lastError = {
      message: '/home/user/.codex/sessions/secret.jsonl prompt body',
    };

    const result = validateRuntimeV2Phase6Gate(snapshot);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('status-mode-expected-default-got-shadow');
    expect(result.failures).toContain('status-worker-restarts-1');
    expect(JSON.stringify(result)).not.toContain('secret.jsonl');
    expect(JSON.stringify(result)).not.toContain('prompt body');
  });

  it('fails closed when runtime health or diagnostics are missing', async () => {
    const { validateRuntimeV2Phase6Gate } = await loadLib();

    expect(validateRuntimeV2Phase6Gate({ health: { ok: false }, perf: {} })).toMatchObject({
      ok: false,
      failures: expect.arrayContaining([
        'runtime-health-not-ok',
        'terminal-mode-expected-new-tabs-got-missing',
        'worker-diagnostics-missing',
      ]),
    });
  });

  it('fails closed when required worker counters are missing', async () => {
    const { validateRuntimeV2Phase6Gate } = await loadLib();
    const snapshot = healthySnapshot();
    delete snapshot.perf.services.runtimeWorkers.status.timeouts;

    expect(validateRuntimeV2Phase6Gate(snapshot)).toMatchObject({
      ok: false,
      failures: expect.arrayContaining(['status-worker-timeouts-missing']),
    });
  });
});
