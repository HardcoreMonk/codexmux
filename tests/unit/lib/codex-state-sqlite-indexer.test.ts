import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ICodexStateSqliteDatabase,
  ICodexStateSqliteOpenOptions,
} from '@/lib/codex-state-sqlite-indexer';

let tempDir: string;

const createCodexDir = async (): Promise<string> => {
  const codexDir = path.join(tempDir, '.codex');
  await fs.mkdir(codexDir, { recursive: true });
  return codexDir;
};

describe('codex state sqlite indexer', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-state-sqlite-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns a missing state without opening sqlite when the Codex dir is absent', async () => {
    const openDatabase = vi.fn();
    const { collectCodexStateSqliteIndex } = await import('@/lib/codex-state-sqlite-indexer');

    await expect(collectCodexStateSqliteIndex({
      codexDir: path.join(tempDir, '.codex'),
      openDatabase,
    })).resolves.toMatchObject({
      state: 'missing',
      fileCount: 0,
      files: [],
      sqliteUnavailable: false,
    });
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('opens only state sqlite files in readonly mode and returns schema/count summaries', async () => {
    const codexDir = await createCodexDir();
    await fs.writeFile(path.join(codexDir, 'state_v2.sqlite'), '');
    await fs.writeFile(path.join(codexDir, 'state_v2.sqlite-wal'), '');
    await fs.writeFile(path.join(codexDir, 'notes.sqlite'), '');

    const pragmaCalls: string[] = [];
    const opened: Array<{ filePath: string; options: ICodexStateSqliteOpenOptions }> = [];
    const db: ICodexStateSqliteDatabase = {
      close: vi.fn(),
      pragma: (sql) => {
        pragmaCalls.push(sql);
      },
      prepare: (sql) => ({
        all: (...params) => {
          const tableName = typeof params[0] === 'string' ? params[0] : undefined;
          if (sql.includes('sqlite_master')) {
            return [{ name: 'messages' }, { name: 'sessions' }];
          }
          if (sql.includes('pragma_table_info')) {
            if (tableName === 'messages') {
              return [
                { name: 'id', type: 'text', notnull: 1, pk: 1 },
                { name: 'body', type: 'text', notnull: 0, pk: 0, secret: 'do-not-leak' },
              ];
            }
            return [
              { name: 'id', type: 'text', notnull: 1, pk: 1 },
              { name: 'updated_at', type: 'text', notnull: 0, pk: 0 },
            ];
          }
          return [];
        },
        get: () => {
          if (sql.includes('"messages"')) return { count: 12, secret: 'row-content' };
          if (sql.includes('"sessions"')) return { count: 2 };
          return { count: 0 };
        },
      }),
    };
    const openDatabase = vi.fn((filePath: string, options: ICodexStateSqliteOpenOptions) => {
      opened.push({ filePath, options });
      return db;
    });

    const { collectCodexStateSqliteIndex } = await import('@/lib/codex-state-sqlite-indexer');
    const index = await collectCodexStateSqliteIndex({ codexDir, openDatabase });

    expect(opened).toEqual([
      {
        filePath: path.join(codexDir, 'state_v2.sqlite'),
        options: { readonly: true, fileMustExist: true },
      },
    ]);
    expect(pragmaCalls).toContain('query_only = ON');
    expect(index).toMatchObject({
      state: 'available',
      fileCount: 1,
      sqliteUnavailable: false,
      files: [
        {
          fileName: 'state_v2.sqlite',
          readable: true,
          tables: [
            {
              name: 'messages',
              rowCount: 12,
              columns: [
                { name: 'id', type: 'text', notNull: true, primaryKey: true },
                { name: 'body', type: 'text', notNull: false, primaryKey: false },
              ],
            },
            {
              name: 'sessions',
              rowCount: 2,
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(index)).not.toContain('row-content');
    expect(JSON.stringify(index)).not.toContain('do-not-leak');
  });

  it('marks sqlite unavailable without throwing when no readonly opener is available', async () => {
    const codexDir = await createCodexDir();
    await fs.writeFile(path.join(codexDir, 'state_a.sqlite'), '');
    const openDatabase = vi.fn(() => {
      throw Object.assign(new Error('missing native binding'), { code: 'MODULE_NOT_FOUND' });
    });

    const { collectCodexStateSqliteIndex } = await import('@/lib/codex-state-sqlite-indexer');
    const index = await collectCodexStateSqliteIndex({ codexDir, openDatabase });

    expect(index).toMatchObject({
      state: 'available',
      fileCount: 1,
      sqliteUnavailable: true,
      files: [
        {
          fileName: 'state_a.sqlite',
          readable: false,
          errorCode: 'sqlite-unavailable',
          tables: [],
        },
      ],
    });
  });
});
