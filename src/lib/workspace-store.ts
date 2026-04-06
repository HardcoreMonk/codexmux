import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { listSessions, killSession } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';
import { broadcastSync } from '@/lib/sync-server';
import {
  readLayoutFile,
  writeLayoutFile,
  resolveLayoutDir,
  resolveLayoutFile,
  crossCheckLayout,
  collectAllTabs,
  createDefaultLayout,
  clearLayoutCache,
} from '@/lib/layout-store';
import type { IWorkspace, IWorkspacesData, ILayoutData } from '@/types/terminal';

const log = createLogger('workspace');

const WORKSPACE_PREFIX = 'Workspace ';

const nextWorkspaceName = (workspaces: IWorkspace[]): string => {
  let max = 0;
  for (const ws of workspaces) {
    if (ws.name.startsWith(WORKSPACE_PREFIX)) {
      const n = parseInt(ws.name.slice(WORKSPACE_PREFIX.length), 10);
      if (n > max) max = n;
    }
  }
  return `${WORKSPACE_PREFIX}${max + 1}`;
};

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const WORKSPACES_FILE = path.join(BASE_DIR, 'workspaces.json');
const LEGACY_LAYOUT_FILE = path.join(BASE_DIR, 'layout.json');
const LEGACY_TABS_FILE = path.join(BASE_DIR, 'tabs.json');

const g = globalThis as unknown as {
  __purplemuxWorkspaceLock?: Promise<void>;
  __purplemuxWorkspacesContentCache?: string;
};
if (!g.__purplemuxWorkspaceLock) g.__purplemuxWorkspaceLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__purplemuxWorkspaceLock!;
  g.__purplemuxWorkspaceLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const emptyState = (): IWorkspacesData => ({
  workspaces: [],
  sidebarCollapsed: false,
  sidebarWidth: 200,
  updatedAt: new Date().toISOString(),
});

const readWorkspacesFile = async (): Promise<IWorkspacesData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(WORKSPACES_FILE, 'utf-8');
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(raw) as IWorkspacesData;
    for (const ws of data.workspaces) {
      const legacy = ws as unknown as { directory?: string };
      if (!ws.directories && legacy.directory) {
        ws.directories = [legacy.directory];
        delete legacy.directory;
      }
    }
    return data;
  } catch {
    log.warn('Failed to parse workspaces.json, starting empty');
    try {
      await fs.copyFile(WORKSPACES_FILE, WORKSPACES_FILE.replace(/\.json$/, '.json.bak'));
    } catch {}
    return null;
  }
};

const writeWorkspacesFile = async (data: IWorkspacesData): Promise<void> => {
  const { workspaces, sidebarCollapsed, sidebarWidth } = data;
  const contentKey = JSON.stringify({ workspaces, sidebarCollapsed, sidebarWidth });

  if (g.__purplemuxWorkspacesContentCache === contentKey) return;

  data.updatedAt = new Date().toISOString();
  const tmpFile = WORKSPACES_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, WORKSPACES_FILE);

  g.__purplemuxWorkspacesContentCache = contentKey;
  broadcastSync({ type: 'workspace' });
};

const migrateFromPhase4 = async (): Promise<IWorkspacesData | null> => {
  const legacyLayout = await readLayoutFile(LEGACY_LAYOUT_FILE);
  if (!legacyLayout) return null;

  const wsId = 'ws-default';
  await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
  await writeLayoutFile(legacyLayout, resolveLayoutFile(wsId));

  const data: IWorkspacesData = {
    workspaces: [{
      id: wsId,
      name: 'default',
      directories: [os.homedir()],
      order: 0,
    }],
    sidebarCollapsed: false,
    sidebarWidth: 200,
    updatedAt: legacyLayout.updatedAt || new Date().toISOString(),
  };

  await writeWorkspacesFile(data);
  log.info(`Phase 4 layout.json → Workspace 'default' migration complete`);
  return data;
};

const migrateFromTabs = async (): Promise<IWorkspacesData | null> => {
  try {
    const raw = await fs.readFile(LEGACY_TABS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null;

    const paneId = `pane-${nanoid(6)}`;
    const legacyLayout: ILayoutData = {
      root: {
        type: 'pane',
        id: paneId,
        tabs: data.tabs,
        activeTabId: data.activeTabId ?? null,
      },
      activePaneId: paneId,
      updatedAt: new Date().toISOString(),
    };

    const tmpFile = LEGACY_LAYOUT_FILE + '.tmp';
    await fs.writeFile(tmpFile, JSON.stringify(legacyLayout, null, 2));
    await fs.rename(tmpFile, LEGACY_LAYOUT_FILE);
    log.info('tabs.json → layout.json migration complete');

    return await migrateFromPhase4();
  } catch {
    return null;
  }
};

export const initWorkspaceStore = async (): Promise<void> => {
  await fs.mkdir(path.join(BASE_DIR, 'workspaces'), { recursive: true });

  let data = await readWorkspacesFile();

  if (!data) {
    const layoutExists = await fs.access(LEGACY_LAYOUT_FILE).then(() => true).catch(() => false);
    if (layoutExists) {
      data = await migrateFromPhase4();
    } else {
      const tabsExists = await fs.access(LEGACY_TABS_FILE).then(() => true).catch(() => false);
      if (tabsExists) {
        data = await migrateFromTabs();
      }
    }
  }

  if (!data) {
    await writeWorkspacesFile(emptyState());
    log.info('Initial workspaces.json created');
    return;
  }

  if (data.workspaces.length === 0) return;

  const allTmuxSessions = await listSessions();

  for (const ws of data.workspaces) {
    const layoutFile = resolveLayoutFile(ws.id);
    let layout = await readLayoutFile(layoutFile);

    if (!layout) {
      log.warn(`Workspace '${ws.name}': layout.json corrupted, reset to default pane`);
      layout = await createDefaultLayout(ws.id, ws.directories[0]);
      await writeLayoutFile(layout, layoutFile);
      continue;
    }

    const wsTabs = collectAllTabs(layout.root);
    const wsSessionNames = wsTabs.map((t) => t.sessionName);

    const wsPrefix = `pt-${ws.id}-`;
    const relevantTmuxSessions = allTmuxSessions.filter(
      (s) => wsSessionNames.includes(s) || s.startsWith(wsPrefix),
    );

    try {
      const changed = await crossCheckLayout(layout, relevantTmuxSessions, ws.id, ws.directories[0]);
      if (changed) {
        await writeLayoutFile(layout, layoutFile);
      }
    } catch (err) {
      log.error(`Workspace '${ws.name}': tmux consistency check failed: ${err instanceof Error ? err.message : err}`);
    }

  }
};

export const getWorkspaces = async (): Promise<{
  workspaces: IWorkspace[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
}> => {
  const data = await readWorkspacesFile();
  if (!data) return { workspaces: [], sidebarCollapsed: false, sidebarWidth: 200 };

  return {
    workspaces: data.workspaces,
    sidebarCollapsed: data.sidebarCollapsed,
    sidebarWidth: data.sidebarWidth,
  };
};

export const getActiveWorkspaceId = async (): Promise<string | null> => {
  const data = await readWorkspacesFile();
  return data?.workspaces[0]?.id ?? null;
};

export const getWorkspaceById = async (wsId: string): Promise<IWorkspace | undefined> => {
  const data = await readWorkspacesFile();
  return data?.workspaces.find((w) => w.id === wsId);
};

export const createWorkspace = async (directory: string, name?: string): Promise<IWorkspace> =>
  withLock(async () => {
    let stat;
    try {
      stat = await fs.stat(directory);
    } catch {
      throw new Error('Directory does not exist');
    }

    if (!stat.isDirectory()) {
      throw new Error('Please enter a directory path, not a file');
    }

    const data = (await readWorkspacesFile()) ?? emptyState();

    const wsId = `ws-${nanoid(6)}`;
    const wsName = name?.trim() || nextWorkspaceName(data.workspaces);
    const order = data.workspaces.length;

    const layout = await createDefaultLayout(wsId, directory);
    await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
    await writeLayoutFile(layout, resolveLayoutFile(wsId));

    const workspace: IWorkspace = { id: wsId, name: wsName, directories: [directory], order };
    data.workspaces.push(workspace);
    await writeWorkspacesFile(data);

    log.info(`Created: ${wsId} (${wsName}, ${directory})`);
    return workspace;
  });

export const deleteWorkspace = async (workspaceId: string): Promise<boolean> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const idx = data.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx === -1) return false;

    const ws = data.workspaces[idx];

    const layout = await readLayoutFile(resolveLayoutFile(workspaceId));
    if (layout) {
      const tabs = collectAllTabs(layout.root);
      for (const tab of tabs) {
        try {
          await killSession(tab.sessionName);
        } catch {}
      }
    }

    try {
      await fs.rm(resolveLayoutDir(workspaceId), { recursive: true, force: true });
    } catch {}
    clearLayoutCache(workspaceId);

    data.workspaces.splice(idx, 1);
    data.workspaces.forEach((w, i) => { w.order = i; });

    await writeWorkspacesFile(data);
    log.info(`Deleted: ${workspaceId} (${ws.name})`);
    return true;
  });

export const renameWorkspace = async (workspaceId: string, name: string): Promise<IWorkspace | null> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return null;

    const ws = data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return null;

    ws.name = name;
    await writeWorkspacesFile(data);

    log.info(`Renamed: ${workspaceId} → "${name}"`);
    return { ...ws };
  });

export const updateActive = async (updates: {
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
}): Promise<void> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    if (updates.sidebarCollapsed !== undefined) data.sidebarCollapsed = updates.sidebarCollapsed;
    if (updates.sidebarWidth !== undefined) data.sidebarWidth = updates.sidebarWidth;
    await writeWorkspacesFile(data);
  });

export const updateWorkspaceDirectories = async (workspaceId: string, directories: string[]): Promise<void> =>
  withLock(async () => {
    const data = await readWorkspacesFile();
    if (!data) return;
    const ws = data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    const current = JSON.stringify(ws.directories);
    if (current === JSON.stringify(directories)) return;
    ws.directories = directories;
    await writeWorkspacesFile(data);
  });

export const reorderWorkspaces = async (workspaceIds: string[]): Promise<boolean> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    const byId = new Map(data.workspaces.map((w) => [w.id, w]));

    const reordered: IWorkspace[] = [];
    for (const id of workspaceIds) {
      const ws = byId.get(id);
      if (!ws) return false;
      reordered.push(ws);
    }

    if (reordered.length !== data.workspaces.length) return false;

    reordered.forEach((w, i) => { w.order = i; });
    data.workspaces = reordered;
    await writeWorkspacesFile(data);
    return true;
  });

export const validateDirectory = async (directory: string): Promise<{
  valid: boolean;
  error?: string;
  suggestedName?: string;
}> => {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Please enter a directory path, not a file' };
    }
  } catch {
    return { valid: false, error: 'Directory does not exist' };
  }

  return { valid: true, suggestedName: path.basename(directory) };
};
