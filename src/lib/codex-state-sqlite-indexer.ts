import fs from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';
import { resolveHostPaths } from '@/lib/host-paths';

export type TCodexStateSqliteIndexState = 'missing' | 'available' | 'unavailable';
export type TCodexStateSqliteErrorCode =
  | 'codex-dir-unreadable'
  | 'open-failed'
  | 'schema-read-failed'
  | 'sqlite-unavailable';

export interface ICodexStateSqliteOpenOptions {
  readonly: true;
  fileMustExist: true;
}

export interface ICodexStateSqliteStatement {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
}

export interface ICodexStateSqliteDatabase {
  close: () => void;
  pragma: (sql: string) => unknown;
  prepare: (sql: string) => ICodexStateSqliteStatement;
}

export type TCodexStateSqliteOpenDatabase = (
  filePath: string,
  options: ICodexStateSqliteOpenOptions,
) => ICodexStateSqliteDatabase;

export interface ICodexStateSqliteColumnSummary {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
}

export interface ICodexStateSqliteTableSummary {
  name: string;
  columns: ICodexStateSqliteColumnSummary[];
  rowCount: number | null;
}

export interface ICodexStateSqliteFileSummary {
  fileName: string;
  sizeBytes: number;
  mtimeMs: number;
  readable: boolean;
  errorCode?: TCodexStateSqliteErrorCode;
  tables: ICodexStateSqliteTableSummary[];
}

export interface ICodexStateSqliteIndex {
  state: TCodexStateSqliteIndexState;
  fileCount: number;
  sqliteUnavailable: boolean;
  errorCode?: TCodexStateSqliteErrorCode;
  files: ICodexStateSqliteFileSummary[];
}

export interface ICollectCodexStateSqliteIndexOptions {
  codexDir?: string;
  openDatabase?: TCodexStateSqliteOpenDatabase;
}

interface IBetterSqlite3Constructor {
  new (dbPath: string, options: ICodexStateSqliteOpenOptions): ICodexStateSqliteDatabase;
}

interface ISqliteMasterRow {
  name?: unknown;
}

interface ISqliteColumnRow {
  name?: unknown;
  type?: unknown;
  notnull?: unknown;
  pk?: unknown;
}

interface ISqliteCountRow {
  count?: unknown;
}

const STATE_SQLITE_FILE_RE = /^state_.*\.sqlite$/i;
const READONLY_OPEN_OPTIONS: ICodexStateSqliteOpenOptions = {
  readonly: true,
  fileMustExist: true,
};

const runtimeRequireBase = path.join(
  process.env.__CMUX_APP_DIR_UNPACKED || process.env.__CMUX_APP_DIR || process.cwd(),
  'package.json',
);
const requireOptional = createRequire(runtimeRequireBase);

const isNodeErrorCode = (err: unknown, code: string): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code;

const isSqliteUnavailableError = (err: unknown): boolean => {
  if (isNodeErrorCode(err, 'MODULE_NOT_FOUND') || isNodeErrorCode(err, 'ERR_DLOPEN_FAILED')) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /better-sqlite3|native binding|Cannot find module/i.test(message);
};

const openBetterSqliteDatabase: TCodexStateSqliteOpenDatabase = (filePath, options) => {
  const Database = requireOptional('better-sqlite3') as IBetterSqlite3Constructor;
  return new Database(filePath, options);
};

const quoteSqliteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const numberFromUnknown = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const stringFromUnknown = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const booleanFromSqliteFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

const listStateSqliteFiles = async (codexDir: string): Promise<string[] | null> => {
  const entries = await fs.readdir(codexDir, { withFileTypes: true }).catch((err: unknown) => {
    if (isNodeErrorCode(err, 'ENOENT')) return null;
    throw err;
  });
  if (!entries) return null;

  return entries
    .filter((entry) => entry.isFile() && STATE_SQLITE_FILE_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const readColumns = (
  db: ICodexStateSqliteDatabase,
  tableName: string,
): ICodexStateSqliteColumnSummary[] => {
  const rows = db.prepare(`
    select name, type, "notnull" as notnull, pk
    from pragma_table_info(?)
    order by cid
  `).all(tableName) as ISqliteColumnRow[];

  return rows.map((row) => ({
    name: stringFromUnknown(row.name),
    type: stringFromUnknown(row.type),
    notNull: booleanFromSqliteFlag(row.notnull),
    primaryKey: booleanFromSqliteFlag(row.pk),
  })).filter((column) => column.name);
};

const readRowCount = (
  db: ICodexStateSqliteDatabase,
  tableName: string,
): number | null => {
  try {
    const row = db.prepare(`select count(*) as count from ${quoteSqliteIdentifier(tableName)}`).get() as ISqliteCountRow | undefined;
    return numberFromUnknown(row?.count);
  } catch {
    return null;
  }
};

const readTables = (db: ICodexStateSqliteDatabase): ICodexStateSqliteTableSummary[] => {
  const rows = db.prepare(`
    select name
    from sqlite_master
    where type = 'table'
      and name not like 'sqlite_%'
    order by name
  `).all() as ISqliteMasterRow[];

  return rows
    .map((row) => stringFromUnknown(row.name))
    .filter(Boolean)
    .map((tableName) => ({
      name: tableName,
      columns: readColumns(db, tableName),
      rowCount: readRowCount(db, tableName),
    }));
};

const inspectStateSqliteFile = async (
  codexDir: string,
  fileName: string,
  openDatabase: TCodexStateSqliteOpenDatabase,
): Promise<ICodexStateSqliteFileSummary> => {
  const filePath = path.join(codexDir, fileName);
  const stat = await fs.stat(filePath);
  const baseSummary = {
    fileName,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    tables: [],
  };

  let db: ICodexStateSqliteDatabase | null = null;
  try {
    db = openDatabase(filePath, READONLY_OPEN_OPTIONS);
    db.pragma('query_only = ON');
    return {
      ...baseSummary,
      readable: true,
      tables: readTables(db),
    };
  } catch (err) {
    return {
      ...baseSummary,
      readable: false,
      errorCode: isSqliteUnavailableError(err) ? 'sqlite-unavailable' : db ? 'schema-read-failed' : 'open-failed',
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
};

export const collectCodexStateSqliteIndex = async ({
  codexDir = resolveHostPaths().codexDir,
  openDatabase = openBetterSqliteDatabase,
}: ICollectCodexStateSqliteIndexOptions = {}): Promise<ICodexStateSqliteIndex> => {
  let fileNames: string[] | null;
  try {
    fileNames = await listStateSqliteFiles(codexDir);
  } catch {
    return {
      state: 'unavailable',
      fileCount: 0,
      sqliteUnavailable: false,
      errorCode: 'codex-dir-unreadable',
      files: [],
    };
  }

  if (!fileNames) {
    return {
      state: 'missing',
      fileCount: 0,
      sqliteUnavailable: false,
      files: [],
    };
  }

  const files = await Promise.all(
    fileNames.map((fileName) => inspectStateSqliteFile(codexDir, fileName, openDatabase)),
  );

  return {
    state: 'available',
    fileCount: files.length,
    sqliteUnavailable: files.some((file) => file.errorCode === 'sqlite-unavailable'),
    files,
  };
};
