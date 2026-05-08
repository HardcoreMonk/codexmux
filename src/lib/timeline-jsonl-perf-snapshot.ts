import { performance } from 'perf_hooks';
import { parseCodexJsonlContent } from '@/lib/codex-session-parser';

export type TTimelineVirtualizationLevel = 'not-needed' | 'measure-live' | 'recommended';
export type TTimelineVirtualizationReason = 'entry-count' | 'parse-duration' | 'byte-size';
export type TTimelinePerfSnapshotSource = 'file' | 'synthetic';

export interface ITimelineVirtualizationInput {
  byteLength: number;
  entryCount: number;
  parseMs: number;
}

export interface ITimelineVirtualizationDecision {
  level: TTimelineVirtualizationLevel;
  reasons: TTimelineVirtualizationReason[];
}

export interface ITimelinePerfSnapshot {
  generatedAt: string;
  byteLength: number;
  lineCount: number;
  entryCount: number;
  parseMs: number;
  virtualization: ITimelineVirtualizationDecision;
}

export interface ITimelinePerfSnapshotReport extends ITimelinePerfSnapshot {
  source: TTimelinePerfSnapshotSource;
  syntheticTurns: number | null;
}

export interface IMeasureTimelineJsonlContentOptions {
  content: string;
  now?: () => number;
}

export interface IBuildTimelinePerfSnapshotReportOptions extends IMeasureTimelineJsonlContentOptions {
  source: TTimelinePerfSnapshotSource;
  syntheticTurns?: number | null;
}

export interface IBuildSyntheticCodexJsonlOptions {
  turns: number;
}

const DEFAULT_THRESHOLDS = {
  measureLive: {
    byteLength: 2_000_000,
    entryCount: 1_000,
    parseMs: 100,
  },
  recommended: {
    byteLength: 5_000_000,
    entryCount: 2_000,
    parseMs: 250,
  },
};

const round = (value: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const lineCountOf = (content: string): number =>
  content.split('\n').filter((line) => line.trim().length > 0).length;

export const classifyTimelineVirtualizationNeed = ({
  byteLength,
  entryCount,
  parseMs,
}: ITimelineVirtualizationInput): ITimelineVirtualizationDecision => {
  const recommendedReasons: TTimelineVirtualizationReason[] = [];
  if (entryCount >= DEFAULT_THRESHOLDS.recommended.entryCount) recommendedReasons.push('entry-count');
  if (parseMs >= DEFAULT_THRESHOLDS.recommended.parseMs) recommendedReasons.push('parse-duration');
  if (byteLength >= DEFAULT_THRESHOLDS.recommended.byteLength) recommendedReasons.push('byte-size');
  if (recommendedReasons.length > 0) {
    return { level: 'recommended', reasons: recommendedReasons };
  }

  const measureReasons: TTimelineVirtualizationReason[] = [];
  if (entryCount >= DEFAULT_THRESHOLDS.measureLive.entryCount) measureReasons.push('entry-count');
  if (parseMs >= DEFAULT_THRESHOLDS.measureLive.parseMs) measureReasons.push('parse-duration');
  if (byteLength >= DEFAULT_THRESHOLDS.measureLive.byteLength) measureReasons.push('byte-size');
  return measureReasons.length > 0
    ? { level: 'measure-live', reasons: measureReasons }
    : { level: 'not-needed', reasons: [] };
};

export const buildSyntheticCodexJsonl = ({ turns }: IBuildSyntheticCodexJsonlOptions): string => {
  const safeTurns = Math.max(0, Math.min(100_000, Math.floor(turns)));
  const lines: string[] = [];

  for (let i = 0; i < safeTurns; i++) {
    const timestamp = new Date(Date.UTC(2026, 4, 8, 0, 0, i % 60)).toISOString();
    lines.push(JSON.stringify({
      type: 'event_msg',
      timestamp,
      payload: { type: 'user_message', message: `synthetic user message ${i + 1}` },
    }));
    lines.push(JSON.stringify({
      type: 'event_msg',
      timestamp,
      payload: { type: 'agent_message', message: `synthetic assistant message ${i + 1}` },
    }));
  }

  return lines.join('\n');
};

export const measureTimelineJsonlContent = ({
  content,
  now = () => performance.now(),
}: IMeasureTimelineJsonlContentOptions): ITimelinePerfSnapshot => {
  const startedAt = now();
  const entries = parseCodexJsonlContent(content);
  const parseMs = round(now() - startedAt);
  const input = {
    byteLength: Buffer.byteLength(content, 'utf-8'),
    lineCount: lineCountOf(content),
    entryCount: entries.length,
    parseMs,
  };

  return {
    generatedAt: new Date().toISOString(),
    ...input,
    virtualization: classifyTimelineVirtualizationNeed(input),
  };
};

export const buildTimelinePerfSnapshotReport = ({
  content,
  source,
  syntheticTurns = null,
  now,
}: IBuildTimelinePerfSnapshotReportOptions): ITimelinePerfSnapshotReport => ({
  source,
  syntheticTurns: source === 'synthetic' ? syntheticTurns : null,
  ...measureTimelineJsonlContent({ content, now }),
});
