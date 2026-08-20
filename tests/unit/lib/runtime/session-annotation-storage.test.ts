import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStorageRepository } from '@/lib/runtime/storage/repository';
import { openRuntimeDatabase, type TRuntimeDatabase } from '@/lib/runtime/storage/schema';

describe('session annotation storage', () => {
  let dir: string;
  let db: TRuntimeDatabase;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-session-annotation-'));
    db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates and version-checks normalized annotations for known sessions', () => {
    const repository = createStorageRepository(db);
    const created = repository.updateSessionAnnotation({
      sessionId: 'session-1',
      pinned: true,
      tags: ['Review', 'review', '검토'],
      expectedVersion: 0,
      sessionExists: true,
      updatedAt: '2026-08-21T09:00:00.000Z',
    });

    expect(created).toEqual({
      sessionId: 'session-1',
      pinned: true,
      tags: ['review', '검토'],
      version: 1,
      updatedAt: '2026-08-21T09:00:00.000Z',
    });
    expect(() => repository.updateSessionAnnotation({
      sessionId: 'session-1',
      pinned: false,
      tags: [],
      expectedVersion: 0,
      sessionExists: true,
      updatedAt: '2026-08-21T09:01:00.000Z',
    })).toThrow(expect.objectContaining({ code: 'session-annotation-version-conflict' }));
  });

  it('fails closed for unknown sessions and corrupt durable JSON', () => {
    const repository = createStorageRepository(db);

    expect(() => repository.updateSessionAnnotation({
      sessionId: 'session-unknown',
      pinned: false,
      tags: [],
      expectedVersion: 0,
      sessionExists: false,
      updatedAt: '2026-08-21T09:00:00.000Z',
    })).toThrow(expect.objectContaining({ code: 'session-annotation-session-not-found' }));
    db.prepare(`insert into session_annotations(session_id, pinned, tags_json, version, updated_at) values (?, 0, ?, 1, ?)`)
      .run('session-corrupt', '{bad', '2026-08-21T09:00:00.000Z');
    expect(() => repository.getSessionAnnotation('session-corrupt'))
      .toThrow(expect.objectContaining({ code: 'session-annotation-corrupt' }));
  });

  it('persists and deletes validated saved filters', () => {
    const repository = createStorageRepository(db);
    const filter = {
      id: 'filter-1',
      name: 'Review',
      query: { query: 'worker', tags: ['review'], limit: 50 },
      createdAt: '2026-08-21T09:00:00.000Z',
      updatedAt: '2026-08-21T09:00:00.000Z',
    };

    repository.upsertSavedSessionFilter(filter);
    expect(repository.listSavedSessionFilters()).toEqual([filter]);
    expect(repository.deleteSavedSessionFilter('filter-1')).toBe(true);
    expect(repository.deleteSavedSessionFilter('filter-1')).toBe(false);
  });
});
