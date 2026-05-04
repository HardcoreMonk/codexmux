import fs from 'fs/promises';
import path from 'path';
import type { ILayoutData, IWorkspacesData } from '@/types/terminal';

export interface ILegacyStorageSnapshot {
  workspacesData: IWorkspacesData;
  layoutsByWorkspaceId: Record<string, ILayoutData | null | undefined>;
}

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

export const readLegacyWorkspacesData = async (dataDir: string): Promise<IWorkspacesData> => {
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

export const readLegacyLayouts = async (
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

export const readLegacyStorageSnapshot = async (dataDir: string): Promise<ILegacyStorageSnapshot> => {
  const workspacesData = await readLegacyWorkspacesData(dataDir);
  const layoutsByWorkspaceId = await readLegacyLayouts(dataDir, workspacesData);
  return { workspacesData, layoutsByWorkspaceId };
};
