import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_RUNTIME_SCHEMA_VERSION,
  openRuntimeDatabase,
  type IRuntimeMigrationBackupInput,
} from '@/lib/runtime/storage/schema';

const requireOptional = createRequire(path.join(process.cwd(), 'package.json'));
const Database = requireOptional('better-sqlite3') as typeof import('better-sqlite3');

describe('runtime storage annotation migration', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'codexmux-storage-migration-'));
  });

  afterEach(async () => {
    await fsPromises.rm(dir, { recursive: true, force: true });
  });

  const createVersion3Database = (dbPath: string) => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.exec(`create table schema_migrations (version integer primary key, applied_at text not null)`);
    const insert = db.prepare(`insert into schema_migrations(version, applied_at) values(?, ?)`);
    for (const version of [1, 2, 3]) insert.run(version, new Date().toISOString());
    db.close();
  };

  it('backs up an existing v3 database before adding annotation tables', () => {
    const dbPath = path.join(dir, 'runtime-v2', 'state.db');
    createVersion3Database(dbPath);
    const backups: IRuntimeMigrationBackupInput[] = [];

    const db = openRuntimeDatabase(dbPath, { beforeMigration: (input) => backups.push(input) });
    const tables = db.prepare(`select name from sqlite_master where type = 'table'`).all()
      .map((row) => (row as { name: string }).name);
    const version = db.prepare(`select max(version) as version from schema_migrations`).get() as { version: number };
    db.close();

    expect(backups).toEqual([{ dbPath, fromVersion: 3, toVersion: CURRENT_RUNTIME_SCHEMA_VERSION }]);
    expect(tables).toEqual(expect.arrayContaining(['session_annotations', 'session_saved_filters']));
    expect(version.version).toBe(CURRENT_RUNTIME_SCHEMA_VERSION);
  });

  it('does not start schema writes when the pre-migration backup fails', () => {
    const dbPath = path.join(dir, 'runtime-v2', 'state.db');
    createVersion3Database(dbPath);
    const beforeMigration = vi.fn(() => {
      throw Object.assign(new Error('backup failed'), { code: 'runtime-v2-migration-backup-failed' });
    });

    expect(() => openRuntimeDatabase(dbPath, { beforeMigration })).toThrow(expect.objectContaining({
      code: 'runtime-v2-migration-backup-failed',
    }));
    const db = new Database(dbPath, { readonly: true });
    const version = db.prepare(`select max(version) as version from schema_migrations`).get() as { version: number };
    const annotation = db.prepare(`select name from sqlite_master where name = 'session_annotations'`).get();
    db.close();

    expect(version.version).toBe(3);
    expect(annotation).toBeUndefined();
  });

  it('keeps the runtime database and its directory private', () => {
    const dbPath = path.join(dir, 'runtime-v2', 'state.db');

    const db = openRuntimeDatabase(dbPath);

    expect(fs.statSync(path.dirname(dbPath)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(dbPath).mode & 0o777).toBe(0o600);
    for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(sidecar)) expect(fs.statSync(sidecar).mode & 0o777).toBe(0o600);
    }
    db.close();
  });
});
