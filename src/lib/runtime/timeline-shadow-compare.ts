import type { IMessageCountResult } from '@/lib/timeline-message-counts';

interface ITimelineEntriesResult {
  entries: Array<{ type?: unknown } & Record<string, unknown>>;
  startByteOffset: number;
  hasMore: boolean;
}

export type TRuntimeTimelineShadowMismatch =
  | {
      type: 'message-count-field-mismatch';
      field: 'userCount' | 'assistantCount' | 'toolCount';
      expected: number;
      actual: number;
    }
  | {
      type: 'tool-breakdown-mismatch';
      toolName: string;
      expected: number;
      actual: number;
    }
  | {
      type: 'entries-field-mismatch';
      field: 'entryCount' | 'startByteOffset' | 'hasMore';
      expected: number | boolean;
      actual: number | boolean;
    }
  | {
      type: 'entry-type-mismatch';
      index: number;
      expected: string;
      actual: string;
    };

export interface IRuntimeTimelineShadowCompareResult {
  ok: boolean;
  mismatches: TRuntimeTimelineShadowMismatch[];
}

const compareCountField = (
  mismatches: TRuntimeTimelineShadowMismatch[],
  field: 'userCount' | 'assistantCount' | 'toolCount',
  expected: IMessageCountResult,
  actual: IMessageCountResult,
): void => {
  if (expected[field] === actual[field]) return;
  mismatches.push({
    type: 'message-count-field-mismatch',
    field,
    expected: expected[field],
    actual: actual[field],
  });
};

export const compareRuntimeTimelineMessageCounts = (
  expected: IMessageCountResult,
  actual: IMessageCountResult,
): IRuntimeTimelineShadowCompareResult => {
  const mismatches: TRuntimeTimelineShadowMismatch[] = [];
  compareCountField(mismatches, 'userCount', expected, actual);
  compareCountField(mismatches, 'assistantCount', expected, actual);
  compareCountField(mismatches, 'toolCount', expected, actual);

  const toolNames = new Set([
    ...Object.keys(expected.toolBreakdown),
    ...Object.keys(actual.toolBreakdown),
  ]);
  for (const toolName of [...toolNames].sort()) {
    const expectedCount = expected.toolBreakdown[toolName] ?? 0;
    const actualCount = actual.toolBreakdown[toolName] ?? 0;
    if (expectedCount === actualCount) continue;
    mismatches.push({
      type: 'tool-breakdown-mismatch',
      toolName,
      expected: expectedCount,
      actual: actualCount,
    });
  }

  return { ok: mismatches.length === 0, mismatches };
};

const entryType = (entry: { type?: unknown }): string =>
  typeof entry.type === 'string' ? entry.type : 'unknown';

export const compareRuntimeTimelineEntries = (
  expected: ITimelineEntriesResult,
  actual: ITimelineEntriesResult,
): IRuntimeTimelineShadowCompareResult => {
  const mismatches: TRuntimeTimelineShadowMismatch[] = [];
  if (expected.entries.length !== actual.entries.length) {
    mismatches.push({
      type: 'entries-field-mismatch',
      field: 'entryCount',
      expected: expected.entries.length,
      actual: actual.entries.length,
    });
  }
  if (expected.startByteOffset !== actual.startByteOffset) {
    mismatches.push({
      type: 'entries-field-mismatch',
      field: 'startByteOffset',
      expected: expected.startByteOffset,
      actual: actual.startByteOffset,
    });
  }
  if (expected.hasMore !== actual.hasMore) {
    mismatches.push({
      type: 'entries-field-mismatch',
      field: 'hasMore',
      expected: expected.hasMore,
      actual: actual.hasMore,
    });
  }

  const length = Math.min(expected.entries.length, actual.entries.length);
  for (let index = 0; index < length; index += 1) {
    const expectedType = entryType(expected.entries[index]);
    const actualType = entryType(actual.entries[index]);
    if (expectedType === actualType) continue;
    mismatches.push({
      type: 'entry-type-mismatch',
      index,
      expected: expectedType,
      actual: actualType,
    });
  }

  return { ok: mismatches.length === 0, mismatches };
};
