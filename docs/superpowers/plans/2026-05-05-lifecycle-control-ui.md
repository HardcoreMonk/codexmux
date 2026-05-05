# Lifecycle Control UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only runtime v2 lifecycle control panel to `/experimental/runtime`.

**Architecture:** Keep all runtime operations read-only in the browser. Normalize `/api/health`, `/api/v2/runtime/health`, and `/api/debug/perf` responses through a pure helper, render the normalized view model with a presentational panel, and keep the existing runtime playground below it.

**Tech Stack:** Next.js Pages Router, TypeScript, React 19, next-intl messages, lucide-react icons, Vitest node tests, `react-dom/server` SSR render tests.

---

## File Structure

- Create `src/lib/runtime/lifecycle-control.ts`
  - Owns API response normalization, worker health aggregation, 24h observation gate calculation, perf timing selection, and rollback runbook strings.
- Create `tests/unit/lib/runtime-lifecycle-control.test.ts`
  - Covers the helper without React or browser dependencies.
- Create `src/components/features/runtime/lifecycle-control-panel.tsx`
  - Presentational read-only panel. It receives a view model and renders release, modes, observation, workers, perf, and rollback runbook sections.
- Create `tests/unit/components/lifecycle-control-panel.test.ts`
  - Uses `react-dom/server` and `React.createElement` to verify the component renders healthy/degraded sections in the existing node Vitest environment.
- Modify `src/pages/experimental/runtime.tsx`
  - Fetches lifecycle endpoints on refresh and passes normalized state to the panel. Existing workspace/tab diagnostic behavior remains.
- Modify `messages/ko/runtime.json`
- Modify `messages/en/runtime.json`
  - Adds lifecycle panel copy.
- Modify `docs/RUNTIME-V2-CUTOVER.md`
- Modify `docs/FOLLOW-UP.md`
- Modify `docs/TESTING.md`
  - Documents the read-only lifecycle panel and smoke expectations.

---

### Task 1: Lifecycle Helper

**Files:**
- Create: `src/lib/runtime/lifecycle-control.ts`
- Create: `tests/unit/lib/runtime-lifecycle-control.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/unit/lib/runtime-lifecycle-control.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildLifecycleViewModel,
  buildRollbackRunbook,
  getObservationGate,
  selectTopPerfTimings,
} from '@/lib/runtime/lifecycle-control';

describe('runtime lifecycle control helper', () => {
  it('calculates a pending 24 hour observation gate', () => {
    const gate = getObservationGate({
      sampledSince: '2026-05-04T19:12:49.000Z',
      generatedAt: '2026-05-04T20:12:49.000Z',
    });

    expect(gate.state).toBe('pending');
    expect(gate.uptimeMs).toBe(60 * 60 * 1000);
    expect(gate.endsAt).toBe('2026-05-05T19:12:49.000Z');
  });

  it('calculates a complete 24 hour observation gate', () => {
    const gate = getObservationGate({
      sampledSince: '2026-05-04T19:12:49.000Z',
      generatedAt: '2026-05-05T19:13:49.000Z',
    });

    expect(gate.state).toBe('complete');
    expect(gate.endsAt).toBe('2026-05-05T19:12:49.000Z');
  });

  it('returns unknown when observation timestamps are missing', () => {
    expect(getObservationGate({ sampledSince: null, generatedAt: null }).state).toBe('unknown');
  });

  it('selects the largest perf timings first', () => {
    const timings = selectTopPerfTimings({
      'status.poll': { count: 10, totalMs: 700, lastMs: 20, minMs: 20, maxMs: 120, averageMs: 70 },
      'stats.cache.build': { count: 1, totalMs: 29378, lastMs: 29378, minMs: 29378, maxMs: 29378, averageMs: 29378 },
      'timeline.read_tail': { count: 2, totalMs: 40, lastMs: 15, minMs: 15, maxMs: 25, averageMs: 20 },
    }, 2);

    expect(timings.map((item) => item.name)).toEqual(['stats.cache.build', 'status.poll']);
  });

  it('builds worker rows without leaking sensitive fields', () => {
    const vm = buildLifecycleViewModel({
      health: {
        app: 'codexmux',
        version: '0.4.1',
        commit: 'abc1234',
        buildTime: '2026-05-04T19:12:31.000Z',
      },
      runtimeHealth: {
        ok: true,
        storage: { ok: true },
        terminal: { ok: true, attached: 0 },
        timeline: { ok: true },
        status: { ok: true },
        terminalV2Mode: 'new-tabs',
        storageV2Mode: 'default',
        timelineV2Mode: 'off',
        statusV2Mode: 'off',
      },
      perf: {
        runtime: {
          generatedAt: '2026-05-04T20:12:49.000Z',
          sampledSince: '2026-05-04T19:12:49.000Z',
          process: { uptimeSec: 3600 },
          timings: {
            'stats.cache.build': { count: 1, totalMs: 29378, lastMs: 29378, minMs: 29378, maxMs: 29378, averageMs: 29378 },
          },
        },
        services: {
          runtimeWorkers: {
            storage: { restarts: 0, timeouts: 0, commandFailures: 0, healthFailures: 0, readyFailures: 0, errors: 0, lastError: null },
            terminal: { restarts: 0, timeouts: 0, commandFailures: 0, healthFailures: 0, readyFailures: 0, errors: 0, lastError: null },
            timeline: { restarts: 0, timeouts: 0, commandFailures: 0, healthFailures: 0, readyFailures: 0, errors: 0, lastError: null },
            status: { restarts: 0, timeouts: 0, commandFailures: 0, healthFailures: 0, readyFailures: 0, errors: 0, lastError: null },
          },
        },
      },
    });

    expect(vm.release.commit).toBe('abc1234');
    expect(vm.modes.map((mode) => `${mode.name}:${mode.value}`)).toEqual([
      'terminal:new-tabs',
      'storage:default',
      'timeline:off',
      'status:off',
    ]);
    expect(vm.workers.every((worker) => worker.state === 'healthy')).toBe(true);
    expect(JSON.stringify(vm)).not.toContain('/data/projects');
    expect(JSON.stringify(vm)).not.toContain('sessionName');
  });

  it('keeps rollback runbook copy-only and token-free', () => {
    const runbook = buildRollbackRunbook();

    expect(runbook).toContain('CODEXMUX_RUNTIME_STORAGE_V2_MODE=write');
    expect(runbook).toContain('CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off');
    expect(runbook).toContain('systemctl --user restart codexmux.service');
    expect(runbook).not.toContain('x-cmux-token');
    expect(runbook).not.toContain('~/.codexmux/cli-token');
  });
});
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime-lifecycle-control.test.ts
```

Expected: fail with an import error because `src/lib/runtime/lifecycle-control.ts` does not exist.

- [ ] **Step 3: Implement the lifecycle helper**

Create `src/lib/runtime/lifecycle-control.ts`:

```typescript
type TModeState = 'active' | 'off' | 'unknown';
type TWorkerState = 'healthy' | 'degraded';
type TObservationState = 'pending' | 'complete' | 'unknown';

interface ITimingMetric {
  count?: number;
  totalMs?: number;
  lastMs?: number;
  minMs?: number;
  maxMs?: number;
  averageMs?: number;
}

interface IWorkerMetric {
  restarts?: number;
  timeouts?: number;
  commandFailures?: number;
  healthFailures?: number;
  readyFailures?: number;
  errors?: number;
  lastError?: string | null;
}

interface IRuntimeHealthPayload {
  ok?: boolean;
  terminalV2Mode?: string;
  storageV2Mode?: string;
  timelineV2Mode?: string;
  statusV2Mode?: string;
}

interface IHealthPayload {
  app?: string;
  version?: string;
  commit?: string;
  buildTime?: string;
}

interface IPerfPayload {
  runtime?: {
    generatedAt?: string;
    sampledSince?: string;
    process?: { uptimeSec?: number };
    timings?: Record<string, ITimingMetric>;
  };
  services?: {
    runtimeWorkers?: Record<string, IWorkerMetric>;
  };
}

export interface ILifecycleModeRow {
  name: 'terminal' | 'storage' | 'timeline' | 'status';
  value: string;
  state: TModeState;
}

export interface ILifecycleWorkerRow {
  name: 'storage' | 'terminal' | 'timeline' | 'status';
  state: TWorkerState;
  restarts: number;
  timeouts: number;
  failures: number;
  lastError: string | null;
}

export interface IObservationGate {
  state: TObservationState;
  sampledSince: string | null;
  generatedAt: string | null;
  endsAt: string | null;
  uptimeMs: number | null;
}

export interface IPerfTimingRow {
  name: string;
  count: number;
  lastMs: number;
  maxMs: number;
  averageMs: number;
  totalMs: number;
}

export interface ILifecycleViewModel {
  release: {
    app: string;
    version: string;
    commit: string;
    buildTime: string | null;
  };
  runtimeOk: boolean;
  modes: ILifecycleModeRow[];
  observation: IObservationGate;
  workers: ILifecycleWorkerRow[];
  perfTimings: IPerfTimingRow[];
  rollbackRunbook: string;
}

const WORKER_NAMES: ILifecycleWorkerRow['name'][] = ['storage', 'terminal', 'timeline', 'status'];
const OBSERVATION_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

const modeState = (value: string): TModeState => {
  if (!value) return 'unknown';
  return value === 'off' ? 'off' : 'active';
};

export const getObservationGate = ({
  sampledSince,
  generatedAt,
}: {
  sampledSince?: string | null;
  generatedAt?: string | null;
}): IObservationGate => {
  if (!sampledSince || !generatedAt) {
    return { state: 'unknown', sampledSince: sampledSince ?? null, generatedAt: generatedAt ?? null, endsAt: null, uptimeMs: null };
  }

  const start = Date.parse(sampledSince);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(start) || !Number.isFinite(generated)) {
    return { state: 'unknown', sampledSince, generatedAt, endsAt: null, uptimeMs: null };
  }

  const uptimeMs = Math.max(0, generated - start);
  const endsAt = new Date(start + OBSERVATION_MS).toISOString();
  return {
    state: uptimeMs >= OBSERVATION_MS ? 'complete' : 'pending',
    sampledSince,
    generatedAt,
    endsAt,
    uptimeMs,
  };
};

export const selectTopPerfTimings = (
  timings: Record<string, ITimingMetric> | undefined,
  limit = 5,
): IPerfTimingRow[] => Object.entries(timings ?? {})
  .map(([name, metric]) => ({
    name,
    count: toNumber(metric.count),
    lastMs: toNumber(metric.lastMs),
    maxMs: toNumber(metric.maxMs),
    averageMs: toNumber(metric.averageMs),
    totalMs: toNumber(metric.totalMs),
  }))
  .sort((a, b) => b.maxMs - a.maxMs || b.averageMs - a.averageMs || a.name.localeCompare(b.name))
  .slice(0, limit);

export const buildRollbackRunbook = (): string => [
  '# Edit ~/.config/systemd/user/codexmux.service.d/runtime-v2-shadow.conf',
  'CODEXMUX_RUNTIME_STORAGE_V2_MODE=write',
  'CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off',
  '',
  'systemctl --user daemon-reload',
  'systemctl --user restart codexmux.service',
  'systemctl --user show codexmux.service --property=ActiveState,SubState,NRestarts,Result',
  'curl -fsS http://127.0.0.1:8122/api/health',
].join('\n');

const buildWorkerRows = (workers: Record<string, IWorkerMetric> | undefined): ILifecycleWorkerRow[] =>
  WORKER_NAMES.map((name) => {
    const worker = workers?.[name] ?? {};
    const failures =
      toNumber(worker.commandFailures) +
      toNumber(worker.healthFailures) +
      toNumber(worker.readyFailures) +
      toNumber(worker.errors);
    const restarts = toNumber(worker.restarts);
    const timeouts = toNumber(worker.timeouts);
    return {
      name,
      state: failures > 0 || restarts > 0 || timeouts > 0 || !!worker.lastError ? 'degraded' : 'healthy',
      restarts,
      timeouts,
      failures,
      lastError: typeof worker.lastError === 'string' ? worker.lastError : null,
    };
  });

export const buildLifecycleViewModel = ({
  health,
  runtimeHealth,
  perf,
}: {
  health?: IHealthPayload | null;
  runtimeHealth?: IRuntimeHealthPayload | null;
  perf?: IPerfPayload | null;
}): ILifecycleViewModel => ({
  release: {
    app: health?.app ?? 'codexmux',
    version: health?.version ?? 'unknown',
    commit: health?.commit ?? 'unknown',
    buildTime: health?.buildTime ?? null,
  },
  runtimeOk: runtimeHealth?.ok === true,
  modes: [
    { name: 'terminal', value: runtimeHealth?.terminalV2Mode ?? 'unknown', state: modeState(runtimeHealth?.terminalV2Mode ?? '') },
    { name: 'storage', value: runtimeHealth?.storageV2Mode ?? 'unknown', state: modeState(runtimeHealth?.storageV2Mode ?? '') },
    { name: 'timeline', value: runtimeHealth?.timelineV2Mode ?? 'unknown', state: modeState(runtimeHealth?.timelineV2Mode ?? '') },
    { name: 'status', value: runtimeHealth?.statusV2Mode ?? 'unknown', state: modeState(runtimeHealth?.statusV2Mode ?? '') },
  ],
  observation: getObservationGate({
    sampledSince: perf?.runtime?.sampledSince ?? null,
    generatedAt: perf?.runtime?.generatedAt ?? null,
  }),
  workers: buildWorkerRows(perf?.services?.runtimeWorkers),
  perfTimings: selectTopPerfTimings(perf?.runtime?.timings),
  rollbackRunbook: buildRollbackRunbook(),
});
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime-lifecycle-control.test.ts
```

Expected: all tests pass.

---

### Task 2: Read-Only Lifecycle Panel Component

**Files:**
- Create: `src/components/features/runtime/lifecycle-control-panel.tsx`
- Create: `tests/unit/components/lifecycle-control-panel.test.ts`

- [ ] **Step 1: Write the failing SSR component tests**

Create `tests/unit/components/lifecycle-control-panel.test.ts`:

```typescript
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LifecycleControlPanel from '@/components/features/runtime/lifecycle-control-panel';
import type { ILifecycleViewModel } from '@/lib/runtime/lifecycle-control';

const vm: ILifecycleViewModel = {
  release: {
    app: 'codexmux',
    version: '0.4.1',
    commit: 'abc1234',
    buildTime: '2026-05-04T19:12:31.000Z',
  },
  runtimeOk: true,
  modes: [
    { name: 'terminal', value: 'new-tabs', state: 'active' },
    { name: 'storage', value: 'default', state: 'active' },
    { name: 'timeline', value: 'off', state: 'off' },
    { name: 'status', value: 'off', state: 'off' },
  ],
  observation: {
    state: 'pending',
    sampledSince: '2026-05-04T19:12:49.000Z',
    generatedAt: '2026-05-04T20:12:49.000Z',
    endsAt: '2026-05-05T19:12:49.000Z',
    uptimeMs: 3600000,
  },
  workers: [
    { name: 'storage', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
    { name: 'terminal', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
    { name: 'timeline', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
    { name: 'status', state: 'healthy', restarts: 0, timeouts: 0, failures: 0, lastError: null },
  ],
  perfTimings: [
    { name: 'stats.cache.build', count: 1, lastMs: 29378, maxMs: 29378, averageMs: 29378, totalMs: 29378 },
  ],
  rollbackRunbook: 'CODEXMUX_RUNTIME_STORAGE_V2_MODE=write\nCODEXMUX_RUNTIME_TERMINAL_V2_MODE=off',
};

describe('LifecycleControlPanel', () => {
  it('renders runtime modes, observation gate, perf, and rollback runbook', () => {
    const html = renderToStaticMarkup(React.createElement(LifecycleControlPanel, { value: vm }));

    expect(html).toContain('0.4.1');
    expect(html).toContain('new-tabs');
    expect(html).toContain('default');
    expect(html).toContain('stats.cache.build');
    expect(html).toContain('CODEXMUX_RUNTIME_STORAGE_V2_MODE=write');
  });

  it('renders degraded worker errors without hiding other sections', () => {
    const degraded: ILifecycleViewModel = {
      ...vm,
      workers: [
        { name: 'storage', state: 'degraded', restarts: 1, timeouts: 0, failures: 1, lastError: 'worker failed' },
        ...vm.workers.slice(1),
      ],
    };
    const html = renderToStaticMarkup(React.createElement(LifecycleControlPanel, { value: degraded }));

    expect(html).toContain('worker failed');
    expect(html).toContain('terminal');
    expect(html).toContain('Rollback');
  });
});
```

- [ ] **Step 2: Run the component tests and verify they fail**

Run:

```bash
corepack pnpm vitest run tests/unit/components/lifecycle-control-panel.test.ts
```

Expected: fail with an import error because `src/components/features/runtime/lifecycle-control-panel.tsx` does not exist.

- [ ] **Step 3: Create the panel component**

Create directory `src/components/features/runtime/` and file `src/components/features/runtime/lifecycle-control-panel.tsx`:

```typescript
import { AlertTriangle, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import type {
  ILifecycleModeRow,
  ILifecycleViewModel,
  ILifecycleWorkerRow,
} from '@/lib/runtime/lifecycle-control';

interface ILifecycleControlPanelProps {
  value: ILifecycleViewModel;
  title?: string;
}

const formatMs = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
};

const formatDate = (value: string | null): string => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : 'unknown';

const modeClass = (mode: ILifecycleModeRow): string => {
  if (mode.state === 'active') return 'border-agent-active/30 bg-agent-active/10 text-agent-active';
  if (mode.state === 'off') return 'border-border bg-muted text-muted-foreground';
  return 'border-ui-amber/30 bg-ui-amber/10 text-ui-amber';
};

const workerClass = (worker: ILifecycleWorkerRow): string =>
  worker.state === 'healthy'
    ? 'border-border/70 bg-background'
    : 'border-ui-amber/40 bg-ui-amber/5';

const LifecycleControlPanel = ({ value, title = 'Lifecycle control' }: ILifecycleControlPanelProps) => (
  <section className="rounded border border-border/70 bg-background p-4">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          Runtime v2 read-only control plane
        </p>
      </div>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs',
          value.runtimeOk ? 'border-agent-active/30 bg-agent-active/10 text-agent-active' : 'border-ui-amber/40 bg-ui-amber/10 text-ui-amber',
        )}
      >
        {value.runtimeOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {value.runtimeOk ? 'runtime ok' : 'runtime degraded'}
      </span>
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border border-border/60 p-3">
        <h3 className="mb-2 text-sm font-medium">Release</h3>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">app</dt>
          <dd>{value.release.app}</dd>
          <dt className="text-muted-foreground">version</dt>
          <dd>{value.release.version}</dd>
          <dt className="text-muted-foreground">commit</dt>
          <dd className="font-mono">{value.release.commit}</dd>
          <dt className="text-muted-foreground">build</dt>
          <dd>{formatDate(value.release.buildTime)}</dd>
        </dl>
      </div>

      <div className="rounded border border-border/60 p-3">
        <h3 className="mb-2 text-sm font-medium">Modes</h3>
        <div className="flex flex-wrap gap-2">
          {value.modes.map((mode) => (
            <span key={mode.name} className={cn('rounded border px-2 py-1 text-xs', modeClass(mode))}>
              {mode.name}: {mode.value}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded border border-border/60 p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Clock3 className="h-4 w-4" />
          Observation
        </h3>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">state</dt>
          <dd>{value.observation.state}</dd>
          <dt className="text-muted-foreground">sampled</dt>
          <dd>{formatDate(value.observation.sampledSince)}</dd>
          <dt className="text-muted-foreground">ends</dt>
          <dd>{formatDate(value.observation.endsAt)}</dd>
          <dt className="text-muted-foreground">uptime</dt>
          <dd>{value.observation.uptimeMs === null ? 'unknown' : formatMs(value.observation.uptimeMs)}</dd>
        </dl>
      </div>

      <div className="rounded border border-border/60 p-3">
        <h3 className="mb-2 text-sm font-medium">Perf watch</h3>
        <div className="space-y-1.5">
          {value.perfTimings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No perf timings available</p>
          ) : value.perfTimings.map((timing) => (
            <div key={timing.name} className="flex items-center justify-between gap-3 rounded bg-muted/50 px-2 py-1.5 text-sm">
              <span className="truncate font-mono text-xs">{timing.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">max {formatMs(timing.maxMs)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="mt-3 rounded border border-border/60 p-3">
      <h3 className="mb-2 text-sm font-medium">Workers</h3>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {value.workers.map((worker) => (
          <div key={worker.name} className={cn('rounded border px-2.5 py-2 text-sm', workerClass(worker))}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">{worker.name}</span>
              <span className="text-xs text-muted-foreground">{worker.state}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              restarts {worker.restarts} · timeouts {worker.timeouts} · failures {worker.failures}
            </p>
            {worker.lastError && <p className="mt-1 truncate text-xs text-ui-amber">{worker.lastError}</p>}
          </div>
        ))}
      </div>
    </div>

    <div className="mt-3 rounded border border-border/60 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <RotateCcw className="h-4 w-4" />
        Rollback
      </h3>
      <pre className="overflow-auto rounded bg-muted p-3 text-xs">
        {value.rollbackRunbook}
      </pre>
    </div>
  </section>
);

export default LifecycleControlPanel;
```

- [ ] **Step 4: Run the component tests and verify they pass**

Run:

```bash
corepack pnpm vitest run tests/unit/components/lifecycle-control-panel.test.ts
```

Expected: all tests pass.

---

### Task 3: Runtime Page Integration And Locale Copy

**Files:**
- Modify: `src/pages/experimental/runtime.tsx`
- Modify: `messages/ko/runtime.json`
- Modify: `messages/en/runtime.json`

- [ ] **Step 1: Add lifecycle panel translations**

Update `messages/ko/runtime.json` with these keys:

```json
"lifecycleTitle": "Lifecycle Control",
"lifecycleDescription": "Runtime v2 운영 상태와 rollback 절차를 읽기 전용으로 확인합니다",
"lifecycleRefresh": "운영 상태 새로고침",
"lifecycleLoadFailed": "운영 상태를 불러오지 못했습니다"
```

Update `messages/en/runtime.json` with these keys:

```json
"lifecycleTitle": "Lifecycle Control",
"lifecycleDescription": "Read-only runtime v2 operations state and rollback runbook",
"lifecycleRefresh": "Refresh operations state",
"lifecycleLoadFailed": "Failed to load lifecycle state"
```

- [ ] **Step 2: Integrate lifecycle fetching into the runtime page**

Modify `src/pages/experimental/runtime.tsx` imports:

```typescript
import LifecycleControlPanel from '@/components/features/runtime/lifecycle-control-panel';
import {
  buildLifecycleViewModel,
  type ILifecycleViewModel,
} from '@/lib/runtime/lifecycle-control';
```

Add state inside `RuntimeExperimentalPage`:

```typescript
  const [lifecycle, setLifecycle] = useState<ILifecycleViewModel | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
```

Add this callback near `requestJson`:

```typescript
  const refreshLifecycle = useCallback(async () => {
    try {
      setLifecycleError(null);
      const [health, runtimeHealth, perf] = await Promise.all([
        requestJson<unknown>('/api/health'),
        requestJson<unknown>('/api/v2/runtime/health'),
        requestJson<unknown>('/api/debug/perf'),
      ]);
      setLifecycle(buildLifecycleViewModel({ health, runtimeHealth, perf }));
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : t('lifecycleLoadFailed'));
    }
  }, [requestJson, t]);
```

Change existing `refresh` to call lifecycle refresh after workspace refresh attempt:

```typescript
  const refresh = useCallback(async () => {
    void refreshLifecycle();
    try {
      setError(null);
      const data = await requestJson<{ workspaces: IRuntimeWorkspace[] }>('/api/v2/workspaces');
      setWorkspaces(data.workspaces);
      setWorkspace((current) => current ?? data.workspaces[0] ?? null);
    } catch (err) {
      setError(err instanceof Error && err.message === 'runtime-v2-disabled' ? t('runtimeUnavailable') : err instanceof Error ? err.message : t('error'));
    }
  }, [refreshLifecycle, requestJson, t]);
```

Render the lifecycle block immediately below the header:

```tsx
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">{t('lifecycleTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('lifecycleDescription')}</p>
            </div>
            <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={refreshLifecycle}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {t('lifecycleRefresh')}
            </Button>
          </div>
          {lifecycleError && <p className="rounded border border-ui-amber/30 bg-ui-amber/5 px-3 py-2 text-sm text-ui-amber">{lifecycleError}</p>}
          {lifecycle && <LifecycleControlPanel value={lifecycle} title={t('lifecycleTitle')} />}
        </section>
```

- [ ] **Step 3: Run typecheck for page integration**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: exits 0.

---

### Task 4: Documentation Update

**Files:**
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/FOLLOW-UP.md`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: Update runtime v2 cutover docs**

In `docs/RUNTIME-V2-CUTOVER.md`, under the current live new-tabs/default cutover section, add:

```markdown
- `/experimental/runtime` read-only lifecycle panel은 live mode, worker diagnostics,
  perf top timings, 24시간 observation gate, rollback runbook을 같은 화면에 표시한다.
  이 화면은 `systemctl`이나 drop-in 변경을 실행하지 않으며, 실제 rollback은 운영자가
  terminal 승인 경로에서 수행한다.
```

- [ ] **Step 2: Update follow-up docs**

In `docs/FOLLOW-UP.md`, update the P3 status bullets:

```markdown
- P3 진행: storage `default` live mode와 terminal `new-tabs` live mode가 적용되어 있으며,
  `/experimental/runtime` read-only lifecycle panel에서 mode, worker health, perf 병목,
  24시간 observation gate, rollback runbook을 확인할 수 있게 한다.
- P3 남음: 24시간 observation 종료 기록, 실제 rollback drill evidence, executable lifecycle
  control 여부 별도 설계, 측정 기반 perf tuning, timeline/status Phase 4/5 cutover.
```

- [ ] **Step 3: Update testing docs**

In `docs/TESTING.md`, add a lifecycle panel smoke note near runtime v2 smoke docs:

```markdown
Lifecycle control panel smoke:

- Authenticated browser session에서 `/experimental/runtime`을 열어 release/mode/worker/perf/
  observation/rollback section이 렌더링되는지 확인한다.
- Panel은 `/api/health`, `/api/v2/runtime/health`, `/api/debug/perf`의 숫자 지표만 표시해야
  하며 token, cwd, session name, JSONL path, prompt, assistant text, terminal output을
  노출하면 안 된다.
```

- [ ] **Step 4: Run docs whitespace check**

Run:

```bash
git diff --check
```

Expected: exits 0.

---

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
corepack pnpm vitest run \
  tests/unit/lib/runtime-lifecycle-control.test.ts \
  tests/unit/components/lifecycle-control-panel.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run broader static checks**

Run:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Run production build**

Run:

```bash
corepack pnpm build
```

Expected: exits 0 and confirms the `/experimental/runtime` page imports are SSR/build safe.

- [ ] **Step 4: Manually inspect live data without exposing secrets**

Run:

```bash
curl -fsS http://127.0.0.1:8122/api/health
TOKEN=$(cat ~/.codexmux/cli-token)
curl -fsS -H "x-cmux-token: $TOKEN" http://127.0.0.1:8122/api/v2/runtime/health
curl -fsS -H "x-cmux-token: $TOKEN" http://127.0.0.1:8122/api/debug/perf
```

Expected:

- `/api/health` returns app/version/commit/buildTime.
- runtime health returns `terminalV2Mode`, `storageV2Mode`, `timelineV2Mode`, `statusV2Mode`.
- perf returns runtime worker counters and timing metrics.
- Do not paste token values into docs, commits, logs, or chat.

- [ ] **Step 5: Review final diff**

Run:

```bash
git status --short --branch
git diff --stat
git diff -- src/lib/runtime/lifecycle-control.ts src/components/features/runtime/lifecycle-control-panel.tsx src/pages/experimental/runtime.tsx
```

Expected:

- Diff is limited to lifecycle panel code, tests, locale strings, and runtime docs.
- No executable rollback API or systemd mutation was added.

---

## Self-Review

Spec coverage:

- Read-only lifecycle overview: Task 2 and Task 3.
- `/api/health`, `/api/v2/runtime/health`, `/api/debug/perf`: Task 1 and Task 3.
- 24-hour gate: Task 1.
- Rollback runbook without execution: Task 1 and Task 2.
- Locale copy: Task 3.
- Docs: Task 4.
- Verification: Task 5.

Placeholder scan:

- No placeholder text is required for implementation.
- No executable lifecycle control is included.

Type consistency:

- Public helper types are prefixed with `I`.
- Union aliases are prefixed with `T`.
- File names use lowercase dashed paths.
- Page Router file remains under `src/pages/experimental/runtime.tsx`.
