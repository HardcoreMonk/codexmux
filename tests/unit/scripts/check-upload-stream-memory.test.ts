import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import {
  MEMORY_GROWTH_LIMIT_BYTES,
  assertProductionSampling,
  createExternalMemorySampler,
  evaluateMemoryGrowth,
  hashRepeatedChunk,
  parseMemoryOracleMode,
  writeRepeatedBody,
} from '../../../scripts/check-upload-stream-memory';

describe('upload stream memory oracle helpers', () => {
  it('parses server controls and requires a valid client port', () => {
    expect(parseMemoryOracleMode([])).toEqual({ mode: 'production' });
    expect(parseMemoryOracleMode(['--harness-control'])).toEqual({ mode: 'harness-control' });
    expect(parseMemoryOracleMode(['--negative-control'])).toEqual({ mode: 'negative-control' });
    expect(parseMemoryOracleMode(['--client', '--port', '8122'])).toEqual({
      mode: 'client',
      port: 8122,
    });

    expect(() => parseMemoryOracleMode(['--client'])).toThrow('client port is required');
    expect(() => parseMemoryOracleMode(['--client', '--port', '0'])).toThrow('invalid client port');
    expect(() => parseMemoryOracleMode(['--harness-control', '--negative-control']))
      .toThrow('memory oracle modes are mutually exclusive');
  });

  it('runs three forced GC cycles before baseline and every sample', () => {
    const gc = vi.fn();
    const values = [1_000, 5_000, 3_000];
    const readExternal = vi.fn(() => values.shift() ?? 0);
    const sampler = createExternalMemorySampler({ gc, readExternal });

    sampler.captureBaseline();
    sampler.sample();
    sampler.sample();

    expect(gc).toHaveBeenCalledTimes(9);
    expect(readExternal).toHaveBeenCalledTimes(3);
    expect(sampler.snapshot()).toEqual({
      baselineBytes: 1_000,
      peakBytes: 5_000,
      growthBytes: 4_000,
      sampleCount: 2,
    });
  });

  it('uses the exact 16MiB boundary for positive and negative controls', () => {
    expect(() => evaluateMemoryGrowth('production', MEMORY_GROWTH_LIMIT_BYTES - 1)).not.toThrow();
    expect(() => evaluateMemoryGrowth('harness-control', MEMORY_GROWTH_LIMIT_BYTES - 1))
      .not.toThrow();
    expect(() => evaluateMemoryGrowth('production', MEMORY_GROWTH_LIMIT_BYTES))
      .toThrow('external memory growth exceeded limit');
    expect(() => evaluateMemoryGrowth('negative-control', MEMORY_GROWTH_LIMIT_BYTES - 1))
      .toThrow('negative control did not detect retained chunks');
    expect(() => evaluateMemoryGrowth('negative-control', MEMORY_GROWTH_LIMIT_BYTES)).not.toThrow();
  });

  it('requires progress-driven production samples throughout the upload', () => {
    expect(() => assertProductionSampling(32, 4)).not.toThrow();
    expect(() => assertProductionSampling(15, 3))
      .toThrow('production upload did not reach the sampling interval');
    expect(() => assertProductionSampling(32, 3))
      .toThrow('production upload memory samples are incomplete');
  });

  it('hashes a repeated chunk without constructing the complete body', () => {
    const chunk = Buffer.from('ab');
    const expected = createHash('sha256').update('ababab').digest('hex');

    expect(hashRepeatedChunk(chunk, 3)).toBe(expected);
  });

  it('reuses one Buffer and waits for drain before continuing writes', async () => {
    class BackpressureWriter extends EventEmitter {
      readonly chunks: Buffer[] = [];
      ended = false;

      write = (chunk: Buffer): boolean => {
        this.chunks.push(chunk);
        if (this.chunks.length !== 1) return true;
        queueMicrotask(() => this.emit('drain'));
        return false;
      };

      end = (callback: () => void): void => {
        this.ended = true;
        callback();
      };
    }

    const writer = new BackpressureWriter();
    const chunk = Buffer.alloc(64 * 1024, 0x5a);

    await writeRepeatedBody(writer, chunk, 3);

    expect(writer.chunks).toEqual([chunk, chunk, chunk]);
    expect(writer.ended).toBe(true);
  });
});
