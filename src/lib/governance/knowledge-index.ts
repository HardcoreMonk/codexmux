import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { IProjectDocumentRef } from '@/lib/governance/contracts';
import type { IDiscoveredProjectDocument } from '@/lib/governance/document-discovery';

type TKnowledgeDatabase = import('better-sqlite3').Database;

interface IBetterSqlite3Constructor {
  new (dbPath: string): TKnowledgeDatabase;
}

interface IKnowledgeDocumentRow {
  projectId: string;
  path: string;
  kind: IProjectDocumentRef['kind'];
  title: string;
  headingsJson: string;
  fingerprint: string;
  lintStatus: IProjectDocumentRef['lintStatus'];
}

interface IKnowledgeLinkRow {
  sourcePath: string;
  targetPath: string;
}

const knowledgeRequire = createRequire(path.join(process.cwd(), 'package.json'));

const loadBetterSqlite3 = (): IBetterSqlite3Constructor =>
  knowledgeRequire('better-sqlite3') as IBetterSqlite3Constructor;

const KNOWLEDGE_SCHEMA = `
create table if not exists governance_documents (
  project_id text not null,
  path text not null,
  kind text not null,
  title text not null,
  headings_json text not null,
  fingerprint text not null,
  lint_status text not null,
  primary key (project_id, path)
);

create table if not exists governance_links (
  project_id text not null,
  source_path text not null,
  target_path text not null,
  primary key (project_id, source_path, target_path),
  foreign key (project_id, source_path)
    references governance_documents(project_id, path) on delete cascade
);

create index if not exists idx_governance_documents_project_kind
  on governance_documents(project_id, kind, path);
create index if not exists idx_governance_links_project_target
  on governance_links(project_id, target_path);
`;

const applyPrivateMode = (filePath: string): void => {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

const toDocument = (row: IKnowledgeDocumentRow): IProjectDocumentRef => ({
  projectId: row.projectId,
  path: row.path,
  kind: row.kind,
  title: row.title,
  headings: JSON.parse(row.headingsJson) as string[],
  fingerprint: row.fingerprint,
  lintStatus: row.lintStatus,
});

export const openKnowledgeIndex = (dbPath: string) => {
  const directory = path.dirname(dbPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const Database = loadBetterSqlite3();
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(KNOWLEDGE_SCHEMA);
  applyPrivateMode(dbPath);
  applyPrivateMode(`${dbPath}-wal`);
  applyPrivateMode(`${dbPath}-shm`);

  const insertDocument = db.prepare(`
    insert into governance_documents (
      project_id, path, kind, title, headings_json, fingerprint, lint_status
    ) values (
      @projectId, @path, @kind, @title, @headingsJson, @fingerprint, @lintStatus
    )
  `);
  const insertLink = db.prepare(`
    insert or ignore into governance_links (project_id, source_path, target_path)
    values (@projectId, @sourcePath, @targetPath)
  `);
  const replaceProjectDocumentsTx = db.transaction((projectId: string, documents: IDiscoveredProjectDocument[]): void => {
    db.prepare('delete from governance_documents where project_id = ?').run(projectId);
    for (const document of documents) {
      insertDocument.run({
        projectId,
        path: document.path,
        kind: document.kind,
        title: document.title,
        headingsJson: JSON.stringify(document.headings),
        fingerprint: document.fingerprint,
        lintStatus: document.lintStatus,
      });
      for (const targetPath of document.links) {
        insertLink.run({ projectId, sourcePath: document.path, targetPath });
      }
    }
  });

  return {
    replaceProjectDocuments: (projectId: string, documents: IDiscoveredProjectDocument[]): void =>
      replaceProjectDocumentsTx(projectId, documents),
    listProjectDocuments: (projectId: string): IProjectDocumentRef[] => {
      const rows = db.prepare(`
        select project_id as projectId, path, kind, title, headings_json as headingsJson,
          fingerprint, lint_status as lintStatus
        from governance_documents
        where project_id = ?
        order by path
      `).all(projectId) as IKnowledgeDocumentRow[];
      return rows.map(toDocument);
    },
    listProjectLinks: (projectId: string): IKnowledgeLinkRow[] =>
      db.prepare(`
        select source_path as sourcePath, target_path as targetPath
        from governance_links
        where project_id = ?
        order by source_path, target_path
      `).all(projectId) as IKnowledgeLinkRow[],
    inspectSchemaSql: (): string => {
      const rows = db.prepare(`
        select sql from sqlite_master
        where sql is not null and name like 'governance_%'
        order by name
      `).all() as Array<{ sql: string }>;
      return rows.map((row) => row.sql).join('\n');
    },
    close: (): void => {
      db.close();
    },
  };
};

export type TKnowledgeIndex = ReturnType<typeof openKnowledgeIndex>;
