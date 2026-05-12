import { describe, expect, it } from 'vitest';

import { buildPerfTriageSnapshot } from '@/lib/perf-triage';

describe('perf triage snapshot', () => {
  it('ranks measured timing bottlenecks by severity and impact', () => {
    const triage = buildPerfTriageSnapshot({
      runtime: {
        timings: {
          'stats.cache.build': { count: 1, averageMs: 1250, maxMs: 3200, lastMs: 3200, totalMs: 3200 },
          'diff.tracked_build': { count: 2, averageMs: 380, maxMs: 900, lastMs: 700, totalMs: 760 },
          'timeline.message_counts.read': { count: 4, averageMs: 42, maxMs: 90, lastMs: 20, totalMs: 168 },
        },
        counters: {},
        eventLoop: {
          delayMs: { p99: 22, max: 80 },
        },
      },
      services: {},
    });

    expect(triage.summary.high).toBe(1);
    expect(triage.summary.medium).toBe(1);
    expect(triage.items.slice(0, 2)).toMatchObject([
      {
        category: 'stats',
        metric: 'stats.cache.build',
        severity: 'high',
      },
      {
        category: 'diff',
        metric: 'diff.tracked_build',
        severity: 'medium',
      },
    ]);
  });

  it('promotes runtime worker failures as high severity without exposing sensitive detail', () => {
    const triage = buildPerfTriageSnapshot({
      runtime: {
        timings: {},
        counters: {},
        eventLoop: {
          delayMs: { p99: 18, max: 40 },
        },
      },
      services: {
        runtimeWorkers: {
          timeline: {
            restarts: 1,
            timeouts: 0,
            healthFailures: 0,
            readyFailures: 0,
            commandFailures: 0,
            errors: 0,
            lastError: {
              message: 'failed for cwd /data/projects/secret prompt hello',
            },
          },
        },
      },
    });

    expect(triage.items[0]).toMatchObject({
      category: 'runtime-worker',
      metric: 'runtimeWorkers.timeline',
      severity: 'high',
    });
    expect(JSON.stringify(triage)).not.toContain('/data/projects/secret');
    expect(JSON.stringify(triage)).not.toContain('prompt hello');
  });

  it('reports event loop delay as runtime evidence', () => {
    const triage = buildPerfTriageSnapshot({
      runtime: {
        timings: {},
        counters: {},
        eventLoop: {
          delayMs: { p99: 275, max: 450 },
        },
      },
      services: {},
    });

    expect(triage.items[0]).toMatchObject({
      category: 'runtime',
      metric: 'eventLoop.delay',
      severity: 'medium',
    });
  });

  it('limits output to the highest impact candidates', () => {
    const timings = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `status.poll.${index}`,
        { count: 1, averageMs: 300 + index, maxMs: 1000 + index, lastMs: 300 + index, totalMs: 300 + index },
      ]),
    );

    const triage = buildPerfTriageSnapshot({
      runtime: { timings, counters: {}, eventLoop: { delayMs: { p99: 20, max: 40 } } },
      services: {},
    });

    expect(triage.items).toHaveLength(8);
    expect(triage.items.every((item) => item.category === 'status')).toBe(true);
  });
});
