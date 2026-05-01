import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalOutputBuffer, type ITerminalOutputFlushMeta } from '@/lib/terminal-output-buffer';

describe('terminal output buffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces chunks until the flush delay elapses', () => {
    const flushed: Array<{ data: string; meta: ITerminalOutputFlushMeta }> = [];
    const buffer = createTerminalOutputBuffer({
      flushDelayMs: 8,
      maxBufferBytes: 1024,
      onFlush: (data, meta) => flushed.push({ data, meta }),
    });

    buffer.push('a');
    buffer.push('b');

    expect(buffer.getBufferedBytes()).toBe(2);
    expect(buffer.hasPendingFlush()).toBe(true);
    vi.advanceTimersByTime(7);
    expect(flushed).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(flushed).toEqual([
      { data: 'ab', meta: { chunkCount: 2, byteLength: 2, reason: 'delay' } },
    ]);
    expect(buffer.getBufferedBytes()).toBe(0);
    expect(buffer.hasPendingFlush()).toBe(false);
  });

  it('flushes immediately when the max buffer size is reached', () => {
    const flushed: Array<{ data: string; meta: ITerminalOutputFlushMeta }> = [];
    const buffer = createTerminalOutputBuffer({
      flushDelayMs: 100,
      maxBufferBytes: 4,
      onFlush: (data, meta) => flushed.push({ data, meta }),
    });

    buffer.push('abc');
    buffer.push('de');

    expect(flushed).toEqual([
      { data: 'abcde', meta: { chunkCount: 2, byteLength: 5, reason: 'max-buffer' } },
    ]);
    expect(buffer.getBufferedBytes()).toBe(0);
    expect(buffer.hasPendingFlush()).toBe(false);
  });

  it('supports manual flush and clear', () => {
    const flushed: Array<{ data: string; meta: ITerminalOutputFlushMeta }> = [];
    const buffer = createTerminalOutputBuffer({
      flushDelayMs: 100,
      maxBufferBytes: 1024,
      onFlush: (data, meta) => flushed.push({ data, meta }),
    });

    buffer.push('pending');
    buffer.flush();
    expect(flushed).toEqual([
      { data: 'pending', meta: { chunkCount: 1, byteLength: 7, reason: 'manual' } },
    ]);

    buffer.push('dropped');
    buffer.clear();
    vi.advanceTimersByTime(100);

    expect(flushed).toHaveLength(1);
    expect(buffer.getBufferedBytes()).toBe(0);
    expect(buffer.hasPendingFlush()).toBe(false);
  });
});
