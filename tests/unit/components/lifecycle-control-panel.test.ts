import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LifecycleControlPanel } from '@/components/features/runtime/lifecycle-control-panel';
import type { ILifecycleViewModel } from '@/lib/runtime/lifecycle-control';

const healthyValue: ILifecycleViewModel = {
  release: {
    app: 'codexmux',
    version: '1.2.3',
    commit: 'abc1234',
    buildTime: '2026-05-01T00:00:00.000Z',
  },
  runtimeOk: true,
  modes: [
    { name: 'terminal', value: 'new-tabs', state: 'active' },
    { name: 'storage', value: 'default', state: 'active' },
    { name: 'timeline', value: 'shadow', state: 'active' },
    { name: 'status', value: 'shadow', state: 'active' },
  ],
  observation: {
    state: 'complete',
    sampledSince: '2026-05-01T00:00:00.000Z',
    generatedAt: '2026-05-02T01:00:00.000Z',
    endsAt: '2026-05-02T00:00:00.000Z',
    uptimeMs: 25 * 60 * 60 * 1000,
  },
  workers: [
    { name: 'storage', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
    { name: 'terminal', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
    { name: 'timeline', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
    { name: 'status', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
  ],
  perfTimings: [
    { name: 'stats.cache.build', count: 2, lastMs: 42, maxMs: 1200, averageMs: 300, totalMs: 600 },
  ],
  rollbackRunbook: [
    'Runtime v2 rollback runbook (copy-only):',
    '1. Set CODEXMUX_RUNTIME_STORAGE_V2_MODE=write.',
    '2. Set CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off.',
    '3. Run systemctl --user restart codexmux.service.',
    '4. Recheck lifecycle health and worker diagnostics.',
  ].join('\n'),
};

const renderPanel = (value: ILifecycleViewModel): string =>
  renderToStaticMarkup(React.createElement(LifecycleControlPanel, { value }));

describe('LifecycleControlPanel', () => {
  it('renders the healthy lifecycle summary without fetching data', () => {
    const markup = renderPanel(healthyValue);

    expect(markup).toContain('1.2.3');
    expect(markup).toContain('2026-05-01 00:00:00 UTC');
    expect(markup).toContain('new-tabs');
    expect(markup).toContain('default');
    expect(markup).toContain('stats.cache.build');
    expect(markup).toContain('systemctl --user restart codexmux.service');
  });

  it('renders degraded worker errors while preserving the other sections', () => {
    const value: ILifecycleViewModel = {
      ...healthyValue,
      runtimeOk: false,
      workers: healthyValue.workers.map((worker) =>
        worker.name === 'terminal'
          ? { ...worker, state: 'degraded', failures: 2, lastError: 'spawn timeout after 5000ms' }
          : worker),
    };

    const markup = renderPanel(value);

    expect(markup).toContain('spawn timeout after 5000ms');
    expect(markup).toContain('Release');
    expect(markup).toContain('Modes');
    expect(markup).toContain('Perf Watch');
    expect(markup).toContain('Rollback Runbook');
  });

  it('renders unknown and pending gate states', () => {
    const value: ILifecycleViewModel = {
      ...healthyValue,
      modes: [
        ...healthyValue.modes.slice(0, 3),
        { name: 'status', value: '', state: 'unknown' },
      ],
      observation: {
        state: 'pending',
        sampledSince: '2026-05-01T00:00:00.000Z',
        generatedAt: '2026-05-01T12:00:00.000Z',
        endsAt: '2026-05-02T00:00:00.000Z',
        uptimeMs: 12 * 60 * 60 * 1000,
      },
    };

    const markup = renderPanel(value);

    expect(markup).toContain('unknown');
    expect(markup).toContain('pending');
  });
});
