import { AlertTriangle, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import type {
  ILifecycleModeRow,
  ILifecycleViewModel,
  ILifecycleWorkerRow,
  TModeState,
  TObservationState,
  TWorkerState,
} from '@/lib/runtime/lifecycle-control';

interface ILifecycleControlPanelProps {
  value: ILifecycleViewModel;
  title?: string;
  description?: string;
}

interface IInfoRowProps {
  label: string;
  value: string;
  className?: string;
}

const formatMs = (ms: number | null): string => {
  if (ms === null) return 'unknown';
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
  return `${ms}ms`;
};

const formatDate = (value: string | null): string => {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'unknown';
  return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
};

const stateBadgeClass = (state: TModeState | TWorkerState | TObservationState | 'ok' | 'degraded'): string => {
  switch (state) {
    case 'active':
    case 'healthy':
    case 'complete':
    case 'ok':
      return 'border-positive/30 bg-positive/10 text-positive';
    case 'off':
    case 'degraded':
    case 'pending':
      return 'border-ui-amber/40 bg-ui-amber/10 text-ui-amber';
    case 'unknown':
      return 'border-muted-foreground/30 bg-muted text-muted-foreground';
  }
};

const modeClass = (mode: ILifecycleModeRow): string =>
  mode.state === 'active'
    ? 'border-border'
    : 'border-ui-amber/40 bg-ui-amber/10 text-ui-amber';

const workerClass = (worker: ILifecycleWorkerRow): string =>
  worker.state === 'healthy'
    ? 'border-border'
    : 'border-ui-amber/40 bg-ui-amber/10 text-ui-amber';

const IconForState = ({ state }: { state: TWorkerState | TObservationState | 'ok' | 'degraded' }) => {
  if (state === 'healthy' || state === 'complete' || state === 'ok') {
    return <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />;
  }
  if (state === 'pending') {
    return <Clock3 aria-hidden className="h-3.5 w-3.5" />;
  }
  return <AlertTriangle aria-hidden className="h-3.5 w-3.5" />;
};

const Badge = ({ label, state }: { label: string; state: TModeState | TWorkerState | TObservationState | 'ok' | 'degraded' }) => (
  <span className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${stateBadgeClass(state)}`}>
    <span className="truncate">{label}</span>
  </span>
);

const InfoRow = ({ label, value, className = '' }: IInfoRowProps) => (
  <div className={`min-w-0 border-b border-border/60 py-1.5 last:border-b-0 ${className}`}>
    <div className="text-[11px] uppercase tracking-normal text-muted-foreground">{label}</div>
    <div className="truncate text-sm font-medium tabular-nums">{value}</div>
  </div>
);

export const LifecycleControlPanel = ({
  value,
  title = 'Lifecycle Control',
  description = 'Read-only runtime lifecycle status',
}: ILifecycleControlPanelProps) => (
  <section className="space-y-3 rounded-lg border border-border bg-background p-3 text-sm">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${stateBadgeClass(value.runtimeOk ? 'ok' : 'degraded')}`}>
        <IconForState state={value.runtimeOk ? 'ok' : 'degraded'} />
        {value.runtimeOk ? 'runtime ok' : 'runtime degraded'}
      </div>
    </div>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="min-w-0 border-t border-border pt-2">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Release</h3>
        <div className="grid grid-cols-2 gap-x-3">
          <InfoRow label="app" value={value.release.app ?? 'unknown'} />
          <InfoRow label="version" value={value.release.version ?? 'unknown'} />
          <InfoRow label="commit" value={value.release.commit ?? 'unknown'} />
          <InfoRow label="build time" value={formatDate(value.release.buildTime)} />
        </div>
      </section>

      <section className="min-w-0 border-t border-border pt-2">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Modes</h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {value.modes.map((mode) => (
            <div key={mode.name} className={`flex min-w-0 items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${modeClass(mode)}`}>
              <span className="truncate text-xs font-medium">{mode.name}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-xs">{mode.value || 'unknown'}</span>
                <Badge label={mode.state} state={mode.state} />
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>

    <section className="min-w-0 border-t border-border pt-2">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Observation</h3>
      <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-5">
        <InfoRow label="gate" value={value.observation.state} className={value.observation.state === 'complete' ? '' : 'text-ui-amber'} />
        <InfoRow label="sampled since" value={formatDate(value.observation.sampledSince)} />
        <InfoRow label="generated at" value={formatDate(value.observation.generatedAt)} />
        <InfoRow label="ends at" value={formatDate(value.observation.endsAt)} />
        <InfoRow label="uptime" value={formatMs(value.observation.uptimeMs)} />
      </div>
    </section>

    <section className="min-w-0 border-t border-border pt-2">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Workers</h3>
      <div className="grid gap-1.5 lg:grid-cols-2">
        {value.workers.map((worker) => (
          <div key={worker.name} className={`min-w-0 rounded-md border px-2 py-1.5 ${workerClass(worker)}`}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <IconForState state={worker.state} />
                <span className="truncate text-sm font-medium">{worker.name}</span>
              </div>
              <Badge label={worker.state} state={worker.state} />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-xs tabular-nums text-muted-foreground">
              <span className="truncate">restarts {worker.restarts}</span>
              <span className="truncate">timeouts {worker.timeouts}</span>
              <span className="truncate">failures {worker.failures}</span>
            </div>
            {worker.lastError && (
              <div className="mt-1 max-h-20 overflow-auto rounded border border-ui-amber/30 bg-background/60 px-2 py-1 font-mono text-[11px] leading-4 text-ui-amber">
                {worker.lastError}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>

    <section className="min-w-0 border-t border-border pt-2">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Perf Watch</h3>
      <div className="overflow-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="border-b border-border text-[11px] uppercase tracking-normal text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">name</th>
              <th className="py-1.5 pr-3 font-medium">count</th>
              <th className="py-1.5 pr-3 font-medium">last</th>
              <th className="py-1.5 pr-3 font-medium">max</th>
              <th className="py-1.5 pr-3 font-medium">avg</th>
              <th className="py-1.5 font-medium">total</th>
            </tr>
          </thead>
          <tbody>
            {value.perfTimings.map((timing) => (
              <tr key={timing.name} className="border-b border-border/60 last:border-b-0">
                <td className="max-w-64 truncate py-1.5 pr-3 font-mono">{timing.name}</td>
                <td className="py-1.5 pr-3 tabular-nums">{timing.count}</td>
                <td className="py-1.5 pr-3 tabular-nums">{formatMs(timing.lastMs)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{formatMs(timing.maxMs)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{formatMs(timing.averageMs)}</td>
                <td className="py-1.5 tabular-nums">{formatMs(timing.totalMs)}</td>
              </tr>
            ))}
            {value.perfTimings.length === 0 && (
              <tr>
                <td className="py-2 text-muted-foreground" colSpan={6}>No perf timings reported.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    <section className="min-w-0 border-t border-border pt-2">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        Rollback Runbook
      </h3>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-5">
        {value.rollbackRunbook}
      </pre>
    </section>
  </section>
);
