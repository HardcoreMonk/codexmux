export type TPerfTriageCategory =
  | 'stats'
  | 'diff'
  | 'timeline'
  | 'status'
  | 'terminal'
  | 'session-index'
  | 'runtime-worker'
  | 'runtime'
  | 'unknown';

export type TPerfTriageSeverity = 'high' | 'medium' | 'low';

export interface IPerfTriageItem {
  category: TPerfTriageCategory;
  metric: string;
  severity: TPerfTriageSeverity;
  reason: string;
  evidence: Record<string, number>;
  impactScore: number;
}

export interface IPerfTriageSummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface IPerfTriageSnapshot {
  generatedAt: string;
  summary: IPerfTriageSummary;
  items: IPerfTriageItem[];
}

interface IPerfTriageInput {
  runtime?: unknown;
  services?: unknown;
  limit?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const readRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const categoryForMetric = (metric: string): TPerfTriageCategory => {
  if (metric.startsWith('stats.')) return 'stats';
  if (metric.startsWith('diff.')) return 'diff';
  if (metric.startsWith('timeline.')) return 'timeline';
  if (metric.startsWith('status.')) return 'status';
  if (metric.startsWith('terminal.')) return 'terminal';
  if (metric.startsWith('sessionIndex.')) return 'session-index';
  return 'unknown';
};

const severityRank: Record<TPerfTriageSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const classifyTimingSeverity = (averageMs: number, maxMs: number): TPerfTriageSeverity | null => {
  if (maxMs >= 3000 || averageMs >= 1000) return 'high';
  if (maxMs >= 1000 || averageMs >= 250) return 'medium';
  return null;
};

const pushTimingItems = (items: IPerfTriageItem[], timings: Record<string, unknown>): void => {
  for (const [metric, rawTiming] of Object.entries(timings)) {
    const timing = readRecord(rawTiming);
    const averageMs = readNumber(timing.averageMs);
    const maxMs = readNumber(timing.maxMs);
    const lastMs = readNumber(timing.lastMs);
    const count = readNumber(timing.count);
    const severity = classifyTimingSeverity(averageMs, maxMs);
    if (!severity) continue;

    items.push({
      category: categoryForMetric(metric),
      metric,
      severity,
      reason: severity === 'high' ? 'slow timing bucket' : 'elevated timing bucket',
      evidence: { averageMs, maxMs, lastMs, count },
      impactScore: Math.max(maxMs, averageMs),
    });
  }
};

const workerFailureKeys = [
  'restarts',
  'timeouts',
  'healthFailures',
  'readyFailures',
  'commandFailures',
  'errors',
];

const pushRuntimeWorkerItems = (items: IPerfTriageItem[], runtimeWorkers: Record<string, unknown>): void => {
  for (const [name, rawWorker] of Object.entries(runtimeWorkers)) {
    const worker = readRecord(rawWorker);
    const evidence = Object.fromEntries(
      workerFailureKeys.map((key) => [key, readNumber(worker[key])]),
    );
    const total = Object.values(evidence).reduce((sum, value) => sum + value, 0);
    if (total <= 0) continue;

    items.push({
      category: 'runtime-worker',
      metric: `runtimeWorkers.${name}`,
      severity: 'high',
      reason: 'runtime worker failure counter increased',
      evidence,
      impactScore: 10_000 + total,
    });
  }
};

const pushEventLoopItem = (items: IPerfTriageItem[], runtime: Record<string, unknown>): void => {
  const eventLoop = readRecord(runtime.eventLoop);
  const delayMs = readRecord(eventLoop.delayMs);
  const p99 = readNumber(delayMs.p99);
  const max = readNumber(delayMs.max);
  if (p99 < 100 && max < 300) return;

  items.push({
    category: 'runtime',
    metric: 'eventLoop.delay',
    severity: max >= 1000 || p99 >= 500 ? 'high' : 'medium',
    reason: 'event loop delay elevated',
    evidence: { p99, max },
    impactScore: Math.max(max, p99),
  });
};

const sortItems = (items: IPerfTriageItem[]): IPerfTriageItem[] =>
  [...items].sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    if (severityDelta !== 0) return severityDelta;
    const impactDelta = b.impactScore - a.impactScore;
    if (impactDelta !== 0) return impactDelta;
    const categoryDelta = a.category.localeCompare(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    return a.metric.localeCompare(b.metric);
  });

const summarize = (items: IPerfTriageItem[]): IPerfTriageSummary => ({
  high: items.filter((item) => item.severity === 'high').length,
  medium: items.filter((item) => item.severity === 'medium').length,
  low: items.filter((item) => item.severity === 'low').length,
  total: items.length,
});

export const buildPerfTriageSnapshot = ({
  runtime,
  services,
  limit = 8,
}: IPerfTriageInput): IPerfTriageSnapshot => {
  const runtimeRecord = readRecord(runtime);
  const servicesRecord = readRecord(services);
  const items: IPerfTriageItem[] = [];

  pushTimingItems(items, readRecord(runtimeRecord.timings));
  pushRuntimeWorkerItems(items, readRecord(servicesRecord.runtimeWorkers));
  pushEventLoopItem(items, runtimeRecord);

  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const selectedItems = sortItems(items).slice(0, safeLimit);

  return {
    generatedAt: new Date().toISOString(),
    summary: summarize(selectedItems),
    items: selectedItems,
  };
};
