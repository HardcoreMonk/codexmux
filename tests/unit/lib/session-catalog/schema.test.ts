import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openSessionCatalogDatabase,
  quarantineSessionCatalogFiles,
  type TSessionCatalogDatabase,
} from '@/lib/session-catalog/schema';

describe('session catalog schema', () => {
  let dir: string;
  const databases: TSessionCatalogDatabase[] = [];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-catalog-schema-'));
  });

  afterEach(async () => {
    for (const db of databases.splice(0)) db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates session, message, cursor, health and FTS tables', () => {
    const dbPath = path.join(dir, 'session-catalog', 'index.db');
    const db = openSessionCatalogDatabase(dbPath);
    databases.push(db);
    const tables = db.prepare(`select name from sqlite_master where type in ('table', 'view')`).all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(expect.arrayContaining([
      'catalog_sessions',
      'catalog_messages',
      'catalog_messages_fts',
      'catalog_file_cursors',
      'catalog_health',
    ]));
  });

  it('creates private directory and database permissions', async () => {
    const dbPath = path.join(dir, 'session-catalog', 'index.db');
    const db = openSessionCatalogDatabase(dbPath);
    databases.push(db);

    expect((await fs.stat(path.dirname(dbPath))).mode & 0o777).toBe(0o700);
    expect((await fs.stat(dbPath)).mode & 0o777).toBe(0o600);
  });

  it('quarantines database sidecars with one timestamp', async () => {
    const dbPath = path.join(dir, 'session-catalog', 'index.db');
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await Promise.all([dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((file) => fs.writeFile(file, file)));

    const moved = await quarantineSessionCatalogFiles(dbPath, '20260821T120000Z');

    expect(moved).toEqual([
      `${dbPath}.quarantine-20260821T120000Z`,
      `${dbPath}-wal.quarantine-20260821T120000Z`,
      `${dbPath}-shm.quarantine-20260821T120000Z`,
    ]);
    await expect(fs.stat(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
