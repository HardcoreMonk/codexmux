import { monitorEventLoopDelay, performance } from 'perf_hooks';

interface IPerfTimingBucket {
  count: number;
  totalMs: number;
  lastMs: number;
  minMs: number;
  maxMs: number;
  updatedAt: string | null;
}

interface IPerfStore {
  eventLoopDelay: ReturnType<typeof monitorEventLoopDelay>;
  startedAt: string;
  timings: Map<string, IPerfTimingBucket>;
  counters: Map<string, number>;
}

export interface IPerfTimingSnapshot extends IPerfTimingBucket {
  averageMs: number;
}

const g = globalThis as unknown as { __ptPerfStore?: IPerfStore };

const createEventLoopDelayMonitor = (): ReturnType<typeof monitorEventLoopDelay> => {
  const monitor = monitorEventLoopDelay({ resolution: 20 });
  monitor.enable();
  return monitor;
};

const store = g.__ptPerfStore ??= {
  eventLoopDelay: createEventLoopDelayMonitor(),
  startedAt: new Date().toISOString(),
  timings: new Map(),
  counters: new Map(),
};

const round = (value: number, digits = 2): number =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;

const nsToMs = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 9e18) return 0;
  return round(value / 1_000_000);
};

export const getPerfNow = (): number => performance.now();

export const recordPerfDuration = (name: string, durationMs: number): void => {
  if (!name || !Number.isFinite(durationMs) || durationMs < 0) return;

  const existing = store.timings.get(name);
  const updatedAt = new Date().toISOString();
  if (!existing) {
    store.timings.set(name, {
      count: 1,
      totalMs: durationMs,
      lastMs: durationMs,
      minMs: durationMs,
      maxMs: durationMs,
      updatedAt,
    });
    return;
  }

  existing.count += 1;
  existing.totalMs += durationMs;
  existing.lastMs = durationMs;
  existing.minMs = Math.min(existing.minMs, durationMs);
  existing.maxMs = Math.max(existing.maxMs, durationMs);
  existing.updatedAt = updatedAt;
};

export const recordPerfCounter = (name: string, delta = 1): void => {
  if (!name || !Number.isFinite(delta) || delta === 0) return;
  store.counters.set(name, (store.counters.get(name) ?? 0) + delta);
};

const snapshotTimings = (): Record<string, IPerfTimingSnapshot> => {
  const result: Record<string, IPerfTimingSnapshot> = {};
  for (const [name, bucket] of store.timings) {
    result[name] = {
      ...bucket,
      totalMs: round(bucket.totalMs),
      lastMs: round(bucket.lastMs),
      minMs: round(bucket.minMs),
      maxMs: round(bucket.maxMs),
      averageMs: round(bucket.totalMs / bucket.count),
    };
  }
  return result;
};

const snapshotCounters = (): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const [name, value] of store.counters) {
    result[name] = value;
  }
  return result;
};

export const getPerfRuntimeSnapshot = () => {
  const memory = process.memoryUsage();
  const delay = store.eventLoopDelay;
  const utilization = performance.eventLoopUtilization();

  return {
    generatedAt: new Date().toISOString(),
    sampledSince: store.startedAt,
    process: {
      pid: process.pid,
      uptimeSec: round(process.uptime(), 1),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory,
    },
    eventLoop: {
      delayMs: {
        min: nsToMs(delay.min),
        mean: nsToMs(delay.mean),
        max: nsToMs(delay.max),
        stddev: nsToMs(delay.stddev),
        p50: nsToMs(delay.percentile(50)),
        p95: nsToMs(delay.percentile(95)),
        p99: nsToMs(delay.percentile(99)),
      },
      utilization: {
        idle: round(utilization.idle, 1),
        active: round(utilization.active, 1),
        utilization: round(utilization.utilization, 4),
      },
    },
    timings: snapshotTimings(),
    counters: snapshotCounters(),
  };
};
