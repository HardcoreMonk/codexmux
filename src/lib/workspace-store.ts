import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { listSessions, killSession } from '@/lib/tmux';
import {
  readLayoutFile,
  writeLayoutFile,
  resolveLayoutDir,
  resolveLayoutFile,
  crossCheckLayout,
  collectAllTabs,
  createDefaultLayout,
} from '@/lib/layout-store';
import type { IWorkspace, IWorkspacesData, ILayoutData } from '@/types/terminal';

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

const BASE_DIR = path.join(os.homedir(), '.purple-terminal');
const WORKSPACES_FILE = path.join(BASE_DIR, 'workspaces.json');
const LEGACY_LAYOUT_FILE = path.join(BASE_DIR, 'layout.json');
const LEGACY_TABS_FILE = path.join(BASE_DIR, 'tabs.json');

const g = globalThis as unknown as { __ptWorkspaceLock?: Promise<void> };
if (!g.__ptWorkspaceLock) g.__ptWorkspaceLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__ptWorkspaceLock!;
  g.__ptWorkspaceLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const emptyState = (): IWorkspacesData => ({
  workspaces: [],
  activeWorkspaceId: null,
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
    console.log('[workspace] workspaces.json 파싱 실패, 빈 상태로 시작합니다');
    try {
      await fs.copyFile(WORKSPACES_FILE, WORKSPACES_FILE.replace(/\.json$/, '.json.bak'));
    } catch {}
    return null;
  }
};

const writeWorkspacesFile = async (data: IWorkspacesData): Promise<void> => {
  data.updatedAt = new Date().toISOString();
  const tmpFile = WORKSPACES_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, WORKSPACES_FILE);
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
    activeWorkspaceId: wsId,
    sidebarCollapsed: false,
    sidebarWidth: 200,
    updatedAt: legacyLayout.updatedAt || new Date().toISOString(),
  };

  await writeWorkspacesFile(data);
  console.log(`[purple-terminal] Phase 4 layout.json → Workspace 'default' 마이그레이션 완료`);
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
      focusedPaneId: paneId,
      updatedAt: new Date().toISOString(),
    };

    const tmpFile = LEGACY_LAYOUT_FILE + '.tmp';
    await fs.writeFile(tmpFile, JSON.stringify(legacyLayout, null, 2));
    await fs.rename(tmpFile, LEGACY_LAYOUT_FILE);
    console.log(`[purple-terminal] tabs.json → layout.json 마이그레이션 완료`);

    return await migrateFromPhase4();
  } catch {
    return null;
  }
};

export const initWorkspaceStore = async (): Promise<void> => {
  await fs.mkdir(path.join(BASE_DIR, 'workspaces'), { recursive: true });

  console.log('[purple-terminal] workspaces.json 로드 중...');

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
    console.log('[purple-terminal] 파일 없음, 빈 상태로 대기');
    return;
  }

  if (data.workspaces.length === 0) return;

  const allTmuxSessions = await listSessions();

  for (const ws of data.workspaces) {
    const layoutFile = resolveLayoutFile(ws.id);
    let layout = await readLayoutFile(layoutFile);

    if (!layout) {
      console.log(`[purple-terminal] Workspace '${ws.name}': layout.json 손상, 기본 Pane으로 초기화`);
      layout = await createDefaultLayout(ws.id, ws.directories[0]);
      await writeLayoutFile(layout, layoutFile);
      collectAllTabs(layout.root).forEach((t) => console.log(`  - ${t.sessionName}`));
      console.log(`[purple-terminal] Workspace '${ws.name}': tmux 정합성 체크 — 1 세션 확인, 0 orphan`);
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
      console.log(`[purple-terminal] Workspace '${ws.name}': tmux 정합성 체크 실패: ${err instanceof Error ? err.message : err}`);
    }

    const finalTabs = collectAllTabs(layout.root);
    const orphanCount = relevantTmuxSessions.filter((s) => !wsSessionNames.includes(s)).length;
    console.log(`[purple-terminal] Workspace '${ws.name}': tmux 정합성 체크 — ${finalTabs.length} 세션 확인, ${orphanCount} orphan`);
  }

  console.log(`[purple-terminal] Workspace ${data.workspaces.length}개 로드 완료`);
  const activeWs = data.workspaces.find((w) => w.id === data!.activeWorkspaceId);
  if (activeWs) {
    console.log(`[purple-terminal] 준비 완료 (활성 Workspace: ${activeWs.name})`);
  }
};

export const getWorkspaces = async (): Promise<{
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  terminalTheme: { light: string; dark: string } | null;
}> => {
  const data = await readWorkspacesFile();
  if (!data) return { workspaces: [], activeWorkspaceId: null, sidebarCollapsed: false, sidebarWidth: 200, terminalTheme: null };

  let theme = data.terminalTheme ?? null;

  // Migration: terminalThemeId (string) → terminalTheme (object)
  const legacy = data as unknown as { terminalThemeId?: string };
  if (!theme && legacy.terminalThemeId) {
    theme = { light: 'catppuccin-latte', dark: legacy.terminalThemeId };
    data.terminalTheme = theme;
    delete legacy.terminalThemeId;
    await writeWorkspacesFile(data);
  }

  return {
    workspaces: data.workspaces,
    activeWorkspaceId: data.activeWorkspaceId,
    sidebarCollapsed: data.sidebarCollapsed,
    sidebarWidth: data.sidebarWidth,
    terminalTheme: theme,
  };
};

export const getActiveWorkspaceId = async (): Promise<string | null> => {
  const data = await readWorkspacesFile();
  return data?.activeWorkspaceId ?? null;
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
      throw new Error('디렉토리가 존재하지 않습니다');
    }

    if (!stat.isDirectory()) {
      throw new Error('파일이 아닌 디렉토리 경로를 입력하세요');
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

    console.log(`[workspace] 생성: ${wsId} (${wsName}, ${directory})`);
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

    data.workspaces.splice(idx, 1);
    data.workspaces.forEach((w, i) => { w.order = i; });

    if (data.activeWorkspaceId === workspaceId) {
      data.activeWorkspaceId = data.workspaces[0]?.id ?? null;
    }

    await writeWorkspacesFile(data);
    console.log(`[workspace] 삭제: ${workspaceId} (${ws.name})`);
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

    console.log(`[workspace] 이름 변경: ${workspaceId} → "${name}"`);
    return { ...ws };
  });

export const updateActive = async (updates: {
  activeWorkspaceId?: string;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  terminalTheme?: { light: string; dark: string };
}): Promise<void> =>
  withLock(async () => {
    const data = (await readWorkspacesFile()) ?? emptyState();
    if (updates.activeWorkspaceId !== undefined) data.activeWorkspaceId = updates.activeWorkspaceId;
    if (updates.sidebarCollapsed !== undefined) data.sidebarCollapsed = updates.sidebarCollapsed;
    if (updates.sidebarWidth !== undefined) data.sidebarWidth = updates.sidebarWidth;
    if (updates.terminalTheme !== undefined) data.terminalTheme = updates.terminalTheme;
    await writeWorkspacesFile(data);
  });

export const validateDirectory = async (directory: string): Promise<{
  valid: boolean;
  error?: string;
  suggestedName?: string;
}> => {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return { valid: false, error: '파일이 아닌 디렉토리 경로를 입력하세요' };
    }
  } catch {
    return { valid: false, error: '디렉토리가 존재하지 않습니다' };
  }

  return { valid: true, suggestedName: path.basename(directory) };
};
