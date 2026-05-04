#!/usr/bin/env tsx
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { importLegacyStorageSnapshot } from '@/lib/runtime/storage-import';
import { openRuntimeDatabase } from '@/lib/runtime/storage/schema';
import type { ILayoutData, IWorkspacesData } from '@/types/terminal';

const createEmptyWorkspacesData = (): IWorkspacesData => ({
  workspaces: [],
  groups: [],
  sidebarCollapsed: false,
  sidebarWidth: 240,
  updatedAt: new Date().toISOString(),
});

const readJsonIfPresent = async (filePath: string): Promise<unknown | null> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

const readWorkspacesData = async (dataDir: string): Promise<IWorkspacesData> => {
  const raw = await readJsonIfPresent(path.join(dataDir, 'workspaces.json'));
  if (!raw) return createEmptyWorkspacesData();
  if (typeof raw === 'object' && raw && Array.isArray((raw as IWorkspacesData).workspaces)) {
    const data = raw as IWorkspacesData;
    return {
      ...data,
      groups: Array.isArray(data.groups) ? data.groups : [],
      sidebarCollapsed: Boolean(data.sidebarCollapsed),
      sidebarWidth: typeof data.sidebarWidth === 'number' ? data.sidebarWidth : 240,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    };
  }
  throw new Error('workspaces.json is present but not a valid workspace list');
};

const readLayouts = async (
  dataDir: string,
  workspacesData: IWorkspacesData,
): Promise<Record<string, ILayoutData | null | undefined>> => {
  const entries = await Promise.all(workspacesData.workspaces.map(async (workspace) => {
    const layoutPath = path.join(dataDir, 'workspaces', workspace.id, 'layout.json');
    const raw = await readJsonIfPresent(layoutPath);
    return [workspace.id, raw as ILayoutData | null | undefined] as const;
  }));
  return Object.fromEntries(entries);
};

const main = async (): Promise<void> => {
  const dataDir = process.env.CODEXMUX_RUNTIME_V2_STORAGE_IMPORT_DATA_DIR
    || path.join(os.homedir(), '.codexmux');
  const dbPath = process.env.CODEXMUX_RUNTIME_V2_STORAGE_IMPORT_DB
    || path.join(dataDir, 'runtime-v2', 'state.db');
  const workspacesData = await readWorkspacesData(dataDir);
  const layoutsByWorkspaceId = await readLayouts(dataDir, workspacesData);
  const db = openRuntimeDatabase(dbPath);
  try {
    const result = importLegacyStorageSnapshot(db, { workspacesData, layoutsByWorkspaceId });
    console.log(JSON.stringify({ ok: true, dbPath, result }, null, 2));
  } finally {
    db.close();
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
