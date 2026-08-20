import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_CATALOG_PERF_THRESHOLDS,
  runSessionCatalogPerfSnapshot,
} from '@/../scripts/session-catalog-perf-snapshot';

describe('Session Catalog performance snapshot', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-session-catalog-perf-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('measures initial index, append, FTS, replay, and memory without retaining message text', async () => {
    const report = await runSessionCatalogPerfSnapshot({
      sessionCount: 50,
      dbPath: path.join(dir, 'index.db'),
    });
    expect(report).toMatchObject({
      sessionCount: 50,
      indexedSessions: 50,
      thresholds: SESSION_CATALOG_PERF_THRESHOLDS,
      passed: true,
    });
    expect(report.timingsMs).toMatchObject({
      initialIndex: expect.any(Number),
      incrementalAppend: expect.any(Number),
      ftsQuery: expect.any(Number),
      replayProjection: expect.any(Number),
    });
    expect(report.memory).toMatchObject({ rssDeltaBytes: expect.any(Number) });
    expect(JSON.stringify(report)).not.toContain('synthetic searchable worker message');
  });
});
