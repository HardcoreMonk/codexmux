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

  it('selects exact include/exclude session sets for pinned and tag predicates', () => {
    const repository = createStorageRepository(db);
    const update = (sessionId: string, pinned: boolean, tags: string[]) => repository.updateSessionAnnotation({
      sessionId,
      pinned,
      tags,
      expectedVersion: 0,
      sessionExists: true,
      updatedAt: '2026-08-21T09:00:00.000Z',
    });
    update('session-pinned', true, ['review', 'urgent']);
    update('session-review', false, ['review']);
    update('session-urgent', false, ['urgent']);

    expect(repository.selectSessionAnnotations({ pinned: true })).toEqual({
      mode: 'include', sessionIds: ['session-pinned'],
    });
    expect(repository.selectSessionAnnotations({ pinned: false })).toEqual({
      mode: 'exclude', sessionIds: ['session-pinned'],
    });
    expect(repository.selectSessionAnnotations({ tags: ['review', 'urgent'] })).toEqual({
      mode: 'include', sessionIds: ['session-pinned'],
    });
    expect(repository.selectSessionAnnotations({ pinned: false, tags: ['review'] })).toEqual({
      mode: 'include', sessionIds: ['session-review'],
    });
    expect(repository.selectSessionAnnotations({ tags: ['missing'] })).toEqual({
      mode: 'include', sessionIds: [],
    });
  });

  it('fails closed instead of truncating an oversized selection', () => {
    const repository = createStorageRepository(db);
    const insert = db.prepare(`
      insert into session_annotations(session_id, pinned, tags_json, version, updated_at)
      values (?, 1, '[]', 1, '2026-08-21T09:00:00.000Z')
    `);
    db.transaction(() => {
      for (let index = 0; index <= 10_000; index += 1) {
        insert.run(`session-${index.toString().padStart(5, '0')}`);
      }
    })();

    expect(() => repository.selectSessionAnnotations({ pinned: true })).toThrow(expect.objectContaining({
      code: 'session-annotation-selection-too-large', retryable: true,
    }));
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
