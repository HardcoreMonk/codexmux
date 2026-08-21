import { describe, expect, it } from 'vitest';
import {
  buildTimelinePerfSnapshotReport,
  buildSyntheticCodexJsonl,
  classifyTimelineVirtualizationNeed,
  measureTimelineJsonlContent,
} from '@/lib/timeline-jsonl-perf-snapshot';

describe('timeline JSONL perf snapshot', () => {
  it('classifies small timelines as not requiring virtualization', () => {
    expect(classifyTimelineVirtualizationNeed({
      byteLength: 10_000,
      entryCount: 120,
      parseMs: 12,
    })).toEqual({
      level: 'not-needed',
      reasons: [],
    });
  });

  it('recommends virtualization from measured large timeline pressure', () => {
    expect(classifyTimelineVirtualizationNeed({
      byteLength: 7_000_000,
      entryCount: 2_500,
      parseMs: 310,
    })).toEqual({
      level: 'recommended',
      reasons: ['entry-count', 'parse-duration', 'byte-size'],
    });
  });

  it('measures synthetic Codex JSONL without exposing prompt content', () => {
    let now = 0;
    const snapshot = measureTimelineJsonlContent({
      content: buildSyntheticCodexJsonl({ turns: 3 }),
      now: () => {
        now += 17;
        return now;
      },
    });

    expect(snapshot.lineCount).toBe(6);
    expect(snapshot.entryCount).toBe(6);
    expect(snapshot.parseMs).toBe(17);
    expect(snapshot.byteLength).toBeGreaterThan(0);
    expect(snapshot.virtualization.level).toBe('not-needed');
    expect(JSON.stringify(snapshot)).not.toContain('synthetic user message');
    expect(JSON.stringify(snapshot)).not.toContain('synthetic assistant message');
  });

  it('formats file snapshots without exposing input paths', () => {
    let now = 0;
    const report = buildTimelinePerfSnapshotReport({
      content: buildSyntheticCodexJsonl({ turns: 1 }),
      source: 'file',
      syntheticTurns: 1,
      now: () => {
        now += 5;
        return now;
      },
    });

    expect(report.source).toBe('file');
    expect(report.syntheticTurns).toBeNull();
    expect(JSON.stringify(report)).not.toContain('D:\\');
    expect(JSON.stringify(report)).not.toContain('.jsonl');
    expect(JSON.stringify(report)).not.toContain('synthetic user message');
  });
});
