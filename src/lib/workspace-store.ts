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

const BASE_DIR = path.join(os.homedir(), '.purple-terminal');
const WORKSPACES_FILE = path.join(BASE_DIR, 'workspaces.json');
const LEGACY_LAYOUT_FILE = path.join(BASE_DIR, 'layout.json');
const LEGACY_TABS_FILE = path.join(BASE_DIR, 'tabs.json');

let store: IWorkspacesData = {
  workspaces: [],
  activeWorkspaceId: null,
  sidebarCollapsed: false,
  sidebarWidth: 200,
  updatedAt: new Date().toISOString(),
};

let writeTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

const flushWorkspacesFile = async (): Promise<void> => {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  store.updatedAt = new Date().toISOString();
  const tmpFile = WORKSPACES_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(store, null, 2));
  await fs.rename(tmpFile, WORKSPACES_FILE);
};

const scheduleWrite = () => {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushWorkspacesFile().catch((err) => {
      console.log(`[workspace] workspaces.json 저장 실패: ${err instanceof Error ? err.message : err}`);
    });
  }, DEBOUNCE_MS);
};

const readWorkspacesFile = async (): Promise<IWorkspacesData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(WORKSPACES_FILE, 'utf-8');
  } catch {
    return null;
  }

  try {
    return JSON.parse(raw) as IWorkspacesData;
  } catch {
    console.log('[workspace] workspaces.json 파싱 실패, 빈 상태로 시작합니다');
    try {
      await fs.copyFile(WORKSPACES_FILE, WORKSPACES_FILE.replace(/\.json$/, '.json.bak'));
    } catch {}
    return null;
  }
};

const migrateFromPhase4 = async (): Promise<boolean> => {
  const legacyLayout = await readLayoutFile(LEGACY_LAYOUT_FILE);
  if (!legacyLayout) return false;

  const wsId = 'ws-default';
  await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
  await writeLayoutFile(legacyLayout, resolveLayoutFile(wsId));

  store = {
    workspaces: [{
      id: wsId,
      name: 'default',
      directory: os.homedir(),
      order: 0,
    }],
    activeWorkspaceId: wsId,
    sidebarCollapsed: false,
    sidebarWidth: 200,
    updatedAt: legacyLayout.updatedAt || new Date().toISOString(),
  };

  await flushWorkspacesFile();
  console.log(`[purple-terminal] Phase 4 layout.json → Workspace 'default' 마이그레이션 완료`);
  return true;
};

const migrateFromTabs = async (): Promise<boolean> => {
  try {
    const raw = await fs.readFile(LEGACY_TABS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) return false;

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

    // Write as legacy layout.json first, then migrate to workspace
    const tmpFile = LEGACY_LAYOUT_FILE + '.tmp';
    await fs.writeFile(tmpFile, JSON.stringify(legacyLayout, null, 2));
    await fs.rename(tmpFile, LEGACY_LAYOUT_FILE);
    console.log(`[purple-terminal] tabs.json → layout.json 마이그레이션 완료`);

    return await migrateFromPhase4();
  } catch {
    return false;
  }
};

export const initWorkspaceStore = async (): Promise<void> => {
  await fs.mkdir(path.join(BASE_DIR, 'workspaces'), { recursive: true });

  console.log('[purple-terminal] workspaces.json 로드 중...');

  const data = await readWorkspacesFile();

  if (data) {
    store = data;
  } else {
    const layoutExists = await fs.access(LEGACY_LAYOUT_FILE).then(() => true).catch(() => false);
    if (layoutExists) {
      await migrateFromPhase4();
    } else {
      const tabsExists = await fs.access(LEGACY_TABS_FILE).then(() => true).catch(() => false);
      if (tabsExists) {
        await migrateFromTabs();
      } else {
        console.log('[purple-terminal] 파일 없음, 빈 상태로 대기');
        return;
      }
    }
  }

  if (store.workspaces.length === 0) return;

  const allTmuxSessions = await listSessions();
  const allLayoutSessions = new Set<string>();

  for (const ws of store.workspaces) {
    const layoutFile = resolveLayoutFile(ws.id);
    let layout = await readLayoutFile(layoutFile);

    if (!layout) {
      console.log(`[purple-terminal] Workspace '${ws.name}': layout.json 손상, 기본 Pane으로 초기화`);
      layout = await createDefaultLayout(ws.id, ws.directory);
      await writeLayoutFile(layout, layoutFile);
      collectAllTabs(layout.root).forEach((t) => allLayoutSessions.add(t.sessionName));
      console.log(`[purple-terminal] Workspace '${ws.name}': tmux 정합성 체크 — 1 세션 확인, 0 orphan`);
      continue;
    }

    const wsTabs = collectAllTabs(layout.root);
    const wsSessionNames = wsTabs.map((t) => t.sessionName);
    wsSessionNames.forEach((s) => allLayoutSessions.add(s));

    const wsPrefix = `pt-${ws.id}-`;
    const relevantTmuxSessions = allTmuxSessions.filter(
      (s) => wsSessionNames.includes(s) || s.startsWith(wsPrefix),
    );

    try {
      const changed = await crossCheckLayout(layout, relevantTmuxSessions, ws.id, ws.directory);
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

  console.log(`[purple-terminal] Workspace ${store.workspaces.length}개 로드 완료`);
  const activeWs = store.workspaces.find((w) => w.id === store.activeWorkspaceId);
  if (activeWs) {
    console.log(`[purple-terminal] 준비 완료 (활성 Workspace: ${activeWs.name})`);
  }
};

export const getWorkspaces = (): {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
} => ({
  workspaces: store.workspaces,
  activeWorkspaceId: store.activeWorkspaceId,
  sidebarCollapsed: store.sidebarCollapsed,
  sidebarWidth: store.sidebarWidth,
});

export const getActiveWorkspaceId = (): string | null => store.activeWorkspaceId;

export const getWorkspaceById = (wsId: string): IWorkspace | undefined =>
  store.workspaces.find((w) => w.id === wsId);

export const createWorkspace = async (directory: string, name?: string): Promise<IWorkspace> => {
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch {
    throw new Error('디렉토리가 존재하지 않습니다');
  }

  if (!stat.isDirectory()) {
    throw new Error('파일이 아닌 디렉토리 경로를 입력하세요');
  }

  if (store.workspaces.some((w) => w.directory === directory)) {
    throw new Error('이미 등록된 디렉토리입니다');
  }

  const wsId = `ws-${nanoid(6)}`;
  const wsName = name?.trim() || path.basename(directory);
  const order = store.workspaces.length;

  const layout = await createDefaultLayout(wsId, directory);
  await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
  await writeLayoutFile(layout, resolveLayoutFile(wsId));

  const workspace: IWorkspace = { id: wsId, name: wsName, directory, order };
  store.workspaces.push(workspace);
  scheduleWrite();

  console.log(`[workspace] 생성: ${wsId} (${wsName}, ${directory})`);
  return workspace;
};

export const deleteWorkspace = async (workspaceId: string): Promise<boolean> => {
  const idx = store.workspaces.findIndex((w) => w.id === workspaceId);
  if (idx === -1) return false;

  const ws = store.workspaces[idx];

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

  store.workspaces.splice(idx, 1);
  store.workspaces.forEach((w, i) => { w.order = i; });

  if (store.activeWorkspaceId === workspaceId) {
    store.activeWorkspaceId = store.workspaces[0]?.id ?? null;
  }

  scheduleWrite();
  console.log(`[workspace] 삭제: ${workspaceId} (${ws.name})`);
  return true;
};

export const renameWorkspace = (workspaceId: string, name: string): IWorkspace | null => {
  const ws = store.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return null;

  ws.name = name;
  scheduleWrite();

  console.log(`[workspace] 이름 변경: ${workspaceId} → "${name}"`);
  return { ...ws };
};

export const updateActive = (updates: {
  activeWorkspaceId?: string;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
}): void => {
  if (updates.activeWorkspaceId !== undefined) store.activeWorkspaceId = updates.activeWorkspaceId;
  if (updates.sidebarCollapsed !== undefined) store.sidebarCollapsed = updates.sidebarCollapsed;
  if (updates.sidebarWidth !== undefined) store.sidebarWidth = updates.sidebarWidth;
  scheduleWrite();
};

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

  if (store.workspaces.some((w) => w.directory === directory)) {
    return { valid: false, error: '이미 등록된 디렉토리입니다' };
  }

  return { valid: true, suggestedName: path.basename(directory) };
};

export const flushWorkspaceStore = async (): Promise<void> => {
  await flushWorkspacesFile();
};
