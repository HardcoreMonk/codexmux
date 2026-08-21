import { describe, expect, it } from 'vitest';
import {
  buildTimelineRichDetails,
  TIMELINE_PREVIEW_ENTRY_BYTES,
  TIMELINE_PREVIEW_FIELD_BYTES,
} from '@/lib/timeline-preview';

describe('buildTimelineRichDetails', () => {
  it('redacts common secret shapes and removes control characters', () => {
    const details = buildTimelineRichDetails({
      output: 'Authorization: Bearer abc123\0 password=hunter2 api_key=secret-value',
    });
    expect(details?.fields.output).not.toContain('abc123');
    expect(details?.fields.output).not.toContain('hunter2');
    expect(details?.fields.output).not.toContain('secret-value');
    expect(details?.fields.output).not.toContain('\0');
  });

  it('bounds each field and the total entry by UTF-8 bytes', () => {
    const details = buildTimelineRichDetails({
      one: '가'.repeat(10_000),
      two: '나'.repeat(10_000),
      three: '다'.repeat(10_000),
      four: '라'.repeat(10_000),
      five: '마'.repeat(10_000),
    });
    const sizes = Object.values(details?.fields ?? {}).map((value) => Buffer.byteLength(value));
    expect(sizes.every((size) => size <= TIMELINE_PREVIEW_FIELD_BYTES)).toBe(true);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(TIMELINE_PREVIEW_ENTRY_BYTES);
    expect(details?.truncated).toBe(true);
  });
});
