import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimelineCatalogService } from '@/lib/runtime/timeline/catalog-service';
import type { IAgentProvider } from '@/lib/providers';
import { codexProvider } from '@/lib/providers/codex';

const content = [
  JSON.stringify({ type: 'session_meta', timestamp: '2026-08-21T08:00:00.000Z', payload: { id: 'session-runtime', cwd: '<fixture-root>/runtime' } }),
  JSON.stringify({ type: 'response_item', timestamp: '2026-08-21T08:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'runtime worker search' }] } }),
  '',
].join('\n');

describe('timeline catalog service', () => {
  let dir: string;
  let sessionsRoot: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-timeline-catalog-'));
    sessionsRoot = path.join(dir, 'sessions');
    await fs.mkdir(sessionsRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('indexes observed Timeline files and replays by session id without returning its path', async () => {
    const jsonlPath = path.join(sessionsRoot, 'session.jsonl');
    await fs.writeFile(jsonlPath, content);
    const readEntriesBefore = vi.fn<IAgentProvider['readEntriesBefore']>(async () => ({
      entries: [],
      startByteOffset: 0,
      hasMore: false,
      fileSize: 0,
      errorCount: 0,
    }));
    const service = createTimelineCatalogService({
      mode: 'default',
      dbPath: path.join(dir, 'catalog', 'index.db'),
      sessionsRoot,
      getProvider: () => ({ ...codexProvider, readEntriesBefore }),
      now: () => '2026-08-21T09:00:00.000Z',
    });

    await service.observeFile(jsonlPath);
    expect(service.search({ query: 'runtime', limit: 50 })).toMatchObject({
      results: [{ entry: { sessionId: 'session-runtime' }, snippet: 'runtime worker search' }],
      health: 'ready',
    });
    const replay = await service.readEntries({
      sessionId: 'session-runtime',
      beforeByte: Buffer.byteLength(content),
      limit: 50,
      panelType: 'codex',
    });

    expect(replay).toEqual({ entries: [], startByteOffset: 0, hasMore: false });
    expect(JSON.stringify(replay)).not.toContain(jsonlPath);
    expect(readEntriesBefore).toHaveBeenCalledWith(jsonlPath, Buffer.byteLength(content), 50);
    expect(service.health()).toMatchObject({ state: 'ready', indexedSessions: 1 });
    service.close();
  });

  it('indexes a bounded rebuild without creating a second watcher', async () => {
    await fs.writeFile(path.join(sessionsRoot, 'first.jsonl'), content);
    await fs.mkdir(path.join(sessionsRoot, 'nested'));
    await fs.writeFile(path.join(sessionsRoot, 'nested', 'second.jsonl'), content.replaceAll('session-runtime', 'session-second'));
    const service = createTimelineCatalogService({
      mode: 'default',
      dbPath: path.join(dir, 'catalog', 'index.db'),
      sessionsRoot,
      getProvider: () => codexProvider,
      now: () => '2026-08-21T09:00:00.000Z',
    });

    await expect(service.rebuild()).resolves.toEqual({ started: true, state: 'building' });
    await service.waitForIdle();

    expect(service.health()).toMatchObject({ state: 'ready', indexedSessions: 2, rebuildState: 'idle' });
    service.close();
  });

  it('builds shadow projections but refuses API search ownership', async () => {
    const service = createTimelineCatalogService({
      mode: 'shadow',
      dbPath: path.join(dir, 'catalog', 'index.db'),
      sessionsRoot,
      getProvider: () => codexProvider,
    });

    expect(() => service.search({ query: 'runtime' })).toThrow(expect.objectContaining({
      code: 'catalog-shadow-only',
      retryable: false,
    }));
    service.close();
  });

  it('rejects observed paths outside the Codex sessions root', async () => {
    const outside = path.join(dir, 'outside.jsonl');
    await fs.writeFile(outside, content);
    const service = createTimelineCatalogService({
      mode: 'default',
      dbPath: path.join(dir, 'catalog', 'index.db'),
      sessionsRoot,
      getProvider: () => codexProvider,
    });

    await expect(service.observeFile(outside)).rejects.toMatchObject({ code: 'catalog-path-forbidden' });
    service.close();
  });
});
