import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSessionCatalogRepository } from '@/lib/session-catalog/index-repository';
import { createSessionCatalogIndexer } from '@/lib/session-catalog/indexer';
import { projectCodexJsonl } from '@/lib/session-catalog/jsonl-projector';
import { createSessionCatalogQueryService } from '@/lib/session-catalog/query-service';
import { openSessionCatalogDatabase } from '@/lib/session-catalog/schema';

export const SESSION_CATALOG_PERF_THRESHOLDS = {
  initialIndexMs: 30_000,
  incrementalAppendMs: 500,
  ftsQueryMs: 1_000,
  replayProjectionMs: 200,
  rssDeltaBytes: 512 * 1024 * 1024,
} as const;

interface ISessionCatalogPerfOptions {
  sessionCount?: number;
  dbPath: string;
}

const buildSession = (index: number): string => {
  const sessionId = `perf-session-${index.toString().padStart(5, '0')}`;
  const minute = index % 60;
  const timestamp = `2026-08-21T10:${minute.toString().padStart(2, '0')}:00.000Z`;
  return [
    JSON.stringify({
      type: 'session_meta', timestamp,
      payload: { id: sessionId, cwd: `/synthetic/project-${index % 25}`, model: 'gpt-5.6' },
    }),
    JSON.stringify({
      type: 'response_item', timestamp,
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `synthetic searchable worker message ${index}` }] },
    }),
    JSON.stringify({
      type: 'response_item', timestamp,
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `indexed response ${index}` }] },
    }),
    '',
  ].join('\n');
};

const elapsed = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(3));

export const runSessionCatalogPerfSnapshot = async ({
  sessionCount = 5_000,
  dbPath,
}: ISessionCatalogPerfOptions) => {
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 20_000) {
    throw new Error('sessionCount must be between 1 and 20,000.');
  }
  const db = openSessionCatalogDatabase(dbPath);
  const repository = createSessionCatalogRepository(db);
  const queryService = createSessionCatalogQueryService(repository);
  const sources = new Map<string, Buffer>();
  const inputs = Array.from({ length: sessionCount }, (_, index) => {
    const canonicalPath = `/synthetic/session-${index}.jsonl`;
    const content = Buffer.from(buildSession(index));
    sources.set(canonicalPath, content);
    return {
      fileKey: `file-${index}`,
      canonicalPath,
      fileIdentity: `synthetic:${index}`,
      mtimeMs: 1,
      sizeBytes: content.byteLength,
    };
  });
  const indexer = createSessionCatalogIndexer({
    repository,
    readChunk: async (filePath, startByte) => (sources.get(filePath) ?? Buffer.alloc(0)).subarray(startByte),
    now: () => '2026-08-21T11:00:00.000Z',
    yieldControl: async () => undefined,
  });
  const memoryBefore = process.memoryUsage().rss;

  try {
    let startedAt = performance.now();
    await indexer.rebuild(inputs, { batchSize: 100 });
    const initialIndex = elapsed(startedAt);

    const first = inputs[0];
    const appendLine = `${JSON.stringify({
      type: 'response_item', timestamp: '2026-08-21T11:01:00.000Z',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'incremental catalog append' }] },
    })}\n`;
    const appended = Buffer.concat([sources.get(first.canonicalPath) ?? Buffer.alloc(0), Buffer.from(appendLine)]);
    sources.set(first.canonicalPath, appended);
    startedAt = performance.now();
    const appendResult = await indexer.indexFile({ ...first, mtimeMs: 2, sizeBytes: appended.byteLength });
    const incrementalAppend = elapsed(startedAt);

    startedAt = performance.now();
    const search = queryService.search({ query: 'worker', limit: 50 });
    const ftsQuery = elapsed(startedAt);

    startedAt = performance.now();
    const replay = projectCodexJsonl((sources.get(first.canonicalPath) ?? Buffer.alloc(0)).toString('utf8'), {
      indexedAt: '2026-08-21T11:02:00.000Z',
    });
    const replayProjection = elapsed(startedAt);
    const rssDeltaBytes = Math.max(0, process.memoryUsage().rss - memoryBefore);
    const indexedSessions = repository.countSessions();
    const passed = indexedSessions === sessionCount
      && appendResult.mode === 'append'
      && search.total === sessionCount
      && replay.records.length > 0
      && initialIndex <= SESSION_CATALOG_PERF_THRESHOLDS.initialIndexMs
      && incrementalAppend <= SESSION_CATALOG_PERF_THRESHOLDS.incrementalAppendMs
      && ftsQuery <= SESSION_CATALOG_PERF_THRESHOLDS.ftsQueryMs
      && replayProjection <= SESSION_CATALOG_PERF_THRESHOLDS.replayProjectionMs
      && rssDeltaBytes <= SESSION_CATALOG_PERF_THRESHOLDS.rssDeltaBytes;

    return {
      sessionCount,
      indexedSessions,
      searchMatches: search.total,
      appendMode: appendResult.mode,
      replayRecords: replay.records.length,
      timingsMs: { initialIndex, incrementalAppend, ftsQuery, replayProjection },
      memory: { rssDeltaBytes },
      thresholds: SESSION_CATALOG_PERF_THRESHOLDS,
      passed,
    };
  } finally {
    db.close();
  }
};

const main = async (): Promise<void> => {
  const configuredDbPath = process.env.CODEXMUX_SESSION_CATALOG_PERF_DB;
  const tempDirectory = configuredDbPath
    ? null
    : await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-session-catalog-perf-'));
  const dbPath = configuredDbPath || path.join(tempDirectory as string, 'index.db');
  const sessionCount = Number(process.env.CODEXMUX_SESSION_CATALOG_PERF_COUNT || 5_000);
  try {
    const report = await runSessionCatalogPerfSnapshot({ sessionCount, dbPath });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally {
    if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true });
  }
};

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
