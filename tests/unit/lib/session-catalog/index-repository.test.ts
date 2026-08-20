import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectCodexJsonl } from '@/lib/session-catalog/jsonl-projector';
import { createSessionCatalogRepository } from '@/lib/session-catalog/index-repository';
import { openSessionCatalogDatabase, type TSessionCatalogDatabase } from '@/lib/session-catalog/schema';

const sessionContent = (sessionId: string, text: string, timestamp: string) => [
  JSON.stringify({ type: 'session_meta', timestamp, payload: { id: sessionId, cwd: `<fixture-root>/${sessionId}`, model: 'gpt-5.6' } }),
  JSON.stringify({ type: 'response_item', timestamp, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }),
].join('\n');

describe('session catalog repository', () => {
  let dir: string;
  let db: TSessionCatalogDatabase;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-catalog-repo-'));
    db = openSessionCatalogDatabase(path.join(dir, 'index.db'));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('atomically replaces a session projection and its FTS records', () => {
    const repository = createSessionCatalogRepository(db);
    const first = projectCodexJsonl(sessionContent('session-one', 'worker health ready', '2026-08-21T08:00:00.000Z'), {
      indexedAt: '2026-08-21T09:00:00.000Z',
    });
    const second = projectCodexJsonl(sessionContent('session-one', 'replacement text', '2026-08-21T08:01:00.000Z'), {
      indexedAt: '2026-08-21T09:01:00.000Z',
    });

    repository.replaceProjection(first);
    expect(repository.search({ match: '"worker"', limit: 50 })).toHaveLength(1);
    repository.replaceProjection(second);

    expect(repository.search({ match: '"worker"', limit: 50 })).toEqual([]);
    expect(repository.search({ match: '"replacement"', limit: 50 })).toEqual([
      expect.objectContaining({ entry: expect.objectContaining({ sessionId: 'session-one' }), snippet: 'replacement text' }),
    ]);
    expect(repository.countMessages('session-one')).toBe(1);
  });

  it('stores internal file cursors without exposing them through search', () => {
    const repository = createSessionCatalogRepository(db);
    repository.upsertFileCursor({
      fileKey: 'file-1',
      canonicalPath: '<fixture-root>/session.jsonl',
      fileIdentity: 'inode-1',
      mtimeMs: 100,
      sizeBytes: 200,
      safeByte: 180,
      sessionId: 'session-one',
      updatedAt: '2026-08-21T09:00:00.000Z',
    });

    expect(repository.getFileCursor('file-1')).toMatchObject({ safeByte: 180, fileIdentity: 'inode-1' });
    expect(JSON.stringify(repository.search({ match: '"fixture"', limit: 50 }))).not.toContain('canonicalPath');
  });

  it('filters search by project, model and date using bound values', () => {
    const repository = createSessionCatalogRepository(db);
    repository.replaceProjection(projectCodexJsonl(
      sessionContent('session-alpha', 'shared phrase', '2026-08-20T08:00:00.000Z'),
      { indexedAt: '2026-08-21T09:00:00.000Z' },
    ));
    repository.replaceProjection(projectCodexJsonl(
      sessionContent('session-beta', 'shared phrase', '2026-08-21T08:00:00.000Z').replace('session-beta\",\"model\":\"gpt-5.6', 'other-project\",\"model\":\"gpt-5.5'),
      { indexedAt: '2026-08-21T09:00:00.000Z' },
    ));

    expect(repository.search({ match: '"shared"', projects: ['session-alpha'], limit: 50 })).toHaveLength(1);
    expect(repository.search({ match: '"shared"', models: ['gpt-5.5'], limit: 50 })).toHaveLength(1);
    expect(repository.search({ match: '"shared"', dateFrom: '2026-08-21T00:00:00.000Z', limit: 50 })).toHaveLength(1);
  });
});
