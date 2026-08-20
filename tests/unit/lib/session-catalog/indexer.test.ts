import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionCatalogRepository } from '@/lib/session-catalog/index-repository';
import { createSessionCatalogIndexer } from '@/lib/session-catalog/indexer';
import { openSessionCatalogDatabase, type TSessionCatalogDatabase } from '@/lib/session-catalog/schema';

const meta = JSON.stringify({
  type: 'session_meta',
  timestamp: '2026-08-21T08:00:00.000Z',
  payload: { id: 'session-indexed', cwd: '<fixture-root>/indexed', model: 'gpt-5.6' },
});
const user = JSON.stringify({
  type: 'response_item',
  timestamp: '2026-08-21T08:00:01.000Z',
  payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'initial message' }] },
});
const assistant = JSON.stringify({
  type: 'response_item',
  timestamp: '2026-08-21T08:00:02.000Z',
  payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'appended message' }] },
});

describe('session catalog incremental indexer', () => {
  let dir: string;
  let db: TSessionCatalogDatabase;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-catalog-indexer-'));
    db = openSessionCatalogDatabase(path.join(dir, 'index.db'));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('indexes once, skips unchanged files and reads append from the last safe byte', async () => {
    let content = `${meta}\n${user}\n`;
    const reads: number[] = [];
    const readChunk = vi.fn(async (_filePath: string, startByte: number) => {
      reads.push(startByte);
      return Buffer.from(content).subarray(startByte);
    });
    const repository = createSessionCatalogRepository(db);
    const indexer = createSessionCatalogIndexer({ repository, readChunk, now: () => '2026-08-21T09:00:00.000Z' });
    const file = () => ({
      fileKey: 'file-1',
      canonicalPath: '<fixture-root>/session.jsonl',
      fileIdentity: 'inode-1',
      mtimeMs: content.length,
      sizeBytes: Buffer.byteLength(content),
    });

    await expect(indexer.indexFile(file())).resolves.toMatchObject({ mode: 'full', indexed: true });
    await expect(indexer.indexFile(file())).resolves.toMatchObject({ mode: 'skipped', indexed: false });
    content += `${assistant}\n`;
    await expect(indexer.indexFile(file())).resolves.toMatchObject({ mode: 'append', indexed: true });

    expect(reads).toEqual([0, Buffer.byteLength(`${meta}\n${user}\n`)]);
    expect(repository.countMessages('session-indexed')).toBe(2);
  });

  it('reprojects from byte zero after truncate or file identity replacement', async () => {
    let content = `${meta}\n${user}\n${assistant}\n`;
    const reads: number[] = [];
    const repository = createSessionCatalogRepository(db);
    const indexer = createSessionCatalogIndexer({
      repository,
      readChunk: async (_filePath, startByte) => {
        reads.push(startByte);
        return Buffer.from(content).subarray(startByte);
      },
      now: () => '2026-08-21T09:00:00.000Z',
    });

    await indexer.indexFile({ fileKey: 'file-1', canonicalPath: '<fixture-root>/session.jsonl', fileIdentity: 'inode-1', mtimeMs: 1, sizeBytes: Buffer.byteLength(content) });
    content = `${meta}\n${user}\n`;
    await expect(indexer.indexFile({ fileKey: 'file-1', canonicalPath: '<fixture-root>/session.jsonl', fileIdentity: 'inode-1', mtimeMs: 2, sizeBytes: Buffer.byteLength(content) }))
      .resolves.toMatchObject({ mode: 'full' });
    await expect(indexer.indexFile({ fileKey: 'file-1', canonicalPath: '<fixture-root>/session.jsonl', fileIdentity: 'inode-2', mtimeMs: 3, sizeBytes: Buffer.byteLength(content) }))
      .resolves.toMatchObject({ mode: 'full' });

    expect(reads).toEqual([0, 0, 0]);
    expect(repository.countMessages('session-indexed')).toBe(1);
  });

  it('checkpoints only complete JSONL lines', async () => {
    const complete = `${meta}\n${user}\n`;
    const partial = '{"type":"response_item"';
    const content = complete + partial;
    const repository = createSessionCatalogRepository(db);
    const indexer = createSessionCatalogIndexer({
      repository,
      readChunk: async (_filePath, startByte) => Buffer.from(content).subarray(startByte),
      now: () => '2026-08-21T09:00:00.000Z',
    });

    await indexer.indexFile({ fileKey: 'file-1', canonicalPath: '<fixture-root>/session.jsonl', fileIdentity: 'inode-1', mtimeMs: 1, sizeBytes: Buffer.byteLength(content) });

    expect(repository.getFileCursor('file-1')?.safeByte).toBe(Buffer.byteLength(complete));
    expect(repository.countMessages('session-indexed')).toBe(1);
  });
});
