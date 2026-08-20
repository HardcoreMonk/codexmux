import { describe, expect, it } from 'vitest';
import { parseRuntimeCommandPayload, parseRuntimeReplyPayload, runtimeCommandRegistry } from '@/lib/runtime/ipc';

describe('session catalog IPC', () => {
  it('registers catalog commands on the timeline worker boundary', () => {
    expect(Object.keys(runtimeCommandRegistry)).toEqual(expect.arrayContaining([
      'timeline.catalog-health',
      'timeline.catalog-search',
      'timeline.catalog-read-entries',
      'timeline.catalog-rebuild',
      'storage.list-session-annotations',
      'storage.update-session-annotation',
      'storage.list-saved-session-filters',
      'storage.upsert-saved-session-filter',
      'storage.delete-saved-session-filter',
    ]));
  });

  it('validates annotation and saved-filter storage payloads', () => {
    expect(parseRuntimeCommandPayload('storage.update-session-annotation', {
      sessionId: 'session-1',
      pinned: true,
      tags: ['review'],
      expectedVersion: 0,
      sessionExists: true,
    })).toMatchObject({ sessionId: 'session-1', expectedVersion: 0 });
    expect(() => parseRuntimeCommandPayload('storage.update-session-annotation', {
      sessionId: 'session-1',
      pinned: true,
      tags: ['bad/tag'],
      expectedVersion: 0,
      sessionExists: true,
    })).toThrow(/Invalid runtime IPC payload/);
  });

  it('validates bounded search and session-id payloads', () => {
    expect(parseRuntimeCommandPayload('timeline.catalog-search', { query: 'worker', limit: 50 }))
      .toEqual({ query: 'worker', limit: 50 });
    expect(() => parseRuntimeCommandPayload('timeline.catalog-search', { query: 'worker', limit: 201 }))
      .toThrow(/Invalid runtime IPC payload/);
    expect(() => parseRuntimeCommandPayload('timeline.catalog-read-entries', {
      sessionId: '../session',
      beforeByte: 100,
      limit: 50,
      panelType: 'codex',
    })).toThrow(/Invalid runtime IPC payload/);
  });

  it('rejects source paths in catalog replies', () => {
    const page = {
      results: [],
      nextCursor: null,
      total: 0,
      health: 'ready',
    };
    expect(parseRuntimeReplyPayload('timeline.catalog-search', page)).toEqual(page);
    expect(() => parseRuntimeReplyPayload('timeline.catalog-search', {
      ...page,
      jsonlPath: '<fixture-root>/session.jsonl',
    })).toThrow(/Invalid runtime IPC reply/);
  });
});
