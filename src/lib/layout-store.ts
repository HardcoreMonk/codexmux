import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { createSession, hasSession, killSession, sendKeys, workspaceSessionName } from '@/lib/tmux';
import { broadcastSync } from '@/lib/sync-server';
import {
  collectPanes,
  collectAllTabs,
  findPane,
  replacePane,
  removePaneWithFocus,
  updateRatioAtPath,
  equalizeNode,
} from '@/lib/layout-tree';
import type { ITab, TLayoutNode, IPaneNode, ILayoutData } from '@/types/terminal';
import type { TCliState } from '@/types/timeline';

const BASE_DIR = path.join(os.homedir(), '.purplemux');

const g = globalThis as unknown as {
  __ptLayoutLock?: Promise<void>;
  __ptLayoutContentCache?: Map<string, string>;
};
if (!g.__ptLayoutLock) g.__ptLayoutLock = Promise.resolve();
if (!g.__ptLayoutContentCache) g.__ptLayoutContentCache = new Map();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__ptLayoutLock!;
  g.__ptLayoutLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

export const generatePaneId = (): string => `pane-${nanoid(6)}`;
export const generateTabId = (): string => `tab-${nanoid(6)}`;

export const resolveLayoutDir = (wsId: string): string =>
  path.join(BASE_DIR, 'workspaces', wsId);

export const resolveLayoutFile = (wsId: string): string =>
  path.join(resolveLayoutDir(wsId), 'layout.json');

const createDefaultTab = (wsId: string, paneId: string, order = 0, cwd?: string): ITab => {
  const tabId = generateTabId();
  const tab: ITab = {
    id: tabId,
    sessionName: workspaceSessionName(wsId, paneId, tabId),
    name: 'Terminal 1',
    order,
  };
  if (cwd) tab.cwd = cwd;
  return tab;
};

const createDefaultPaneNode = (wsId: string, cwd?: string): { pane: IPaneNode; tab: ITab } => {
  const paneId = generatePaneId();
  const tab = createDefaultTab(wsId, paneId, 0, cwd);
  return {
    pane: { type: 'pane', id: paneId, tabs: [tab], activeTabId: tab.id },
    tab,
  };
};

export const readLayoutFile = async (filePath: string): Promise<ILayoutData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  try {
    return JSON.parse(raw) as ILayoutData;
  } catch {
    console.log(`[layout] ${filePath} 파싱 실패`);
    try {
      await fs.copyFile(filePath, filePath.replace(/\.json$/, '.json.bak'));
    } catch {}
    return null;
  }
};

const extractWsIdFromPath = (filePath: string): string | null => {
  const match = filePath.match(/workspaces\/(ws-[^/]+)\//);
  return match?.[1] ?? null;
};

export const writeLayoutFile = async (data: ILayoutData, filePath: string): Promise<void> => {
  const contentKey = JSON.stringify({ root: data.root, activePaneId: data.activePaneId });
  const cache = g.__ptLayoutContentCache!;

  if (cache.get(filePath) === contentKey) return;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpFile = filePath + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, filePath);

  cache.set(filePath, contentKey);

  const wsId = extractWsIdFromPath(filePath);
  if (wsId) broadcastSync({ type: 'layout', workspaceId: wsId });
};

export const clearLayoutCache = (wsId: string): void => {
  const filePath = resolveLayoutFile(wsId);
  g.__ptLayoutContentCache!.delete(filePath);
};

export { collectPanes, collectAllTabs, normalizeTree } from '@/lib/layout-tree';

const syncWorkspaceDirectories = (wsId: string, root: TLayoutNode): void => {
  const cwds = [...new Set(
    collectAllTabs(root)
      .map((t) => t.cwd)
      .filter((c): c is string => !!c),
  )];
  if (cwds.length > 0) {
    import('@/lib/workspace-store').then(({ updateWorkspaceDirectories }) => {
      updateWorkspaceDirectories(wsId, cwds).catch(() => {});
    }).catch(() => {});
  }
};

export const crossCheckLayout = async (
  layout: ILayoutData,
  tmuxSessions: string[],
  wsId: string,
  defaultCwd?: string,
): Promise<boolean> => {
  let changed = false;
  const tmuxSet = new Set(tmuxSessions);
  const panes = collectPanes(layout.root);
  const layoutSessions = new Set<string>();

  for (const pane of panes) {
    for (const tab of pane.tabs) {
      layoutSessions.add(tab.sessionName);

      if (!tmuxSet.has(tab.sessionName) && tab.panelType === 'claude-code') {
        const cwd = tab.cwd || defaultCwd;
        console.log(`[crossCheck] Claude 탭 세션 재생성: ${tab.sessionName} (cwd: ${cwd})`);
        await createSession(tab.sessionName, 80, 24, cwd);
        changed = true;
      }
    }
  }

  const orphans = tmuxSessions.filter((s) => !layoutSessions.has(s));
  if (orphans.length > 0) {
    changed = true;
    const firstPane = panes[0];
    if (firstPane) {
      let maxOrder = firstPane.tabs.length > 0 ? Math.max(...firstPane.tabs.map((t) => t.order)) : -1;
      for (const sessionName of orphans) {
        maxOrder++;
        firstPane.tabs.push({
          id: generateTabId(),
          sessionName,
          name: `Terminal ${maxOrder + 1}`,
          order: maxOrder,
        });
      }
      if (!firstPane.activeTabId && firstPane.tabs.length > 0) {
        firstPane.activeTabId = firstPane.tabs[0].id;
      }
    }
  }

  if (changed) {
    layout.updatedAt = new Date().toISOString();
    const finalPanes = collectPanes(layout.root);
    if (layout.activePaneId && !finalPanes.some((p) => p.id === layout.activePaneId)) {
      layout.activePaneId = finalPanes[0]?.id ?? null;
    }
  }

  return changed;
};

export const createDefaultLayout = async (wsId: string, cwd: string): Promise<ILayoutData> => {
  const { pane, tab } = createDefaultPaneNode(wsId, cwd);
  await createSession(tab.sessionName, 80, 24, cwd);
  return {
    root: pane,
    activePaneId: pane.id,
    updatedAt: new Date().toISOString(),
  };
};

export const getLayout = async (wsId: string, defaultCwd?: string): Promise<ILayoutData> =>
  withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const existing = await readLayoutFile(filePath);
    if (existing) return existing;

    const { pane, tab } = createDefaultPaneNode(wsId, defaultCwd);
    await createSession(tab.sessionName, 80, 24, defaultCwd);

    const layout: ILayoutData = {
      root: pane,
      activePaneId: pane.id,
      updatedAt: new Date().toISOString(),
    };
    await writeLayoutFile(layout, filePath);
    console.log(`[layout] 기본 레이아웃 생성 (workspace: ${wsId}, pane: ${pane.id})`);
    return layout;
  });

export const createPane = async (wsId: string, cwd?: string): Promise<{ paneId: string; tab: ITab }> => {
  const paneId = generatePaneId();
  const tabId = generateTabId();
  const sessionName = workspaceSessionName(wsId, paneId, tabId);

  await createSession(sessionName, 80, 24, cwd);

  const tab: ITab = { id: tabId, sessionName, name: 'Terminal 1', order: 0, ...(cwd ? { cwd } : {}) };
  console.log(`[layout] pane 생성: ${paneId}, tab: ${tabId}, session: ${sessionName}`);
  return { paneId, tab };
};

export const deletePane = async (
  paneId: string,
  sessions: string[] = [],
): Promise<void> => {
  for (const session of sessions) {
    try {
      await killSession(session);
    } catch {
      // session already gone
    }
  }
  console.log(`[layout] pane 삭제: ${paneId} (세션 ${sessions.length}개 종료)`);
};

export const addTabToPane = async (wsId: string, paneId: string, name?: string, cwd?: string, panelType?: string): Promise<ITab | null> =>
  withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return null;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return null;

    const tabId = generateTabId();
    const sessionName = workspaceSessionName(wsId, paneId, tabId);
    await createSession(sessionName, 80, 24, cwd);

    const nextOrder = pane.tabs.length > 0 ? Math.max(...pane.tabs.map((t) => t.order)) + 1 : 0;
    const tabName = name?.trim() || nextTabName(pane.tabs);
    const tab: ITab = { id: tabId, sessionName, name: tabName, order: nextOrder, ...(cwd ? { cwd } : {}), ...(panelType ? { panelType: panelType as ITab['panelType'] } : {}) };

    pane.tabs.push(tab);
    pane.activeTabId = tabId;
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);
    syncWorkspaceDirectories(wsId,layout.root);

    console.log(`[layout] 탭 추가: pane=${paneId}, tab=${tabId}, session=${sessionName}`);
    return tab;
  });

export const removeTabFromPane = async (wsId: string, paneId: string, tabId: string): Promise<boolean> => {
  const sessionName = await withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return null;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return null;

    const tab = pane.tabs.find((t) => t.id === tabId);
    return tab?.sessionName ?? null;
  });

  if (!sessionName) return false;

  await killSession(sessionName);

  return withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return false;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return false;

    const idx = pane.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return false;

    pane.tabs.splice(idx, 1);

    if (pane.activeTabId === tabId) {
      pane.activeTabId = pane.tabs[0]?.id ?? null;
    }

    if (pane.tabs.length === 0 && collectPanes(layout.root).length > 1) {
      removePaneWithFocus(layout, paneId);
    }

    pane.tabs.forEach((t, i) => { t.order = i; });
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);
    syncWorkspaceDirectories(wsId, layout.root);

    console.log(`[layout] 탭 삭제: pane=${paneId}, tab=${tabId}`);
    return true;
  });
};

export const renameTabInPane = async (wsId: string, paneId: string, tabId: string, name: string): Promise<ITab | null> =>
  withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return null;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return null;

    const tab = pane.tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    tab.name = name;
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);

    console.log(`[layout] 탭 이름 변경: pane=${paneId}, tab=${tabId} → "${name}"`);
    return { ...tab };
  });

export const restartTabSession = async (wsId: string, paneId: string, tabId: string, command?: string): Promise<boolean> =>
  withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return false;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return false;

    const tab = pane.tabs.find((t) => t.id === tabId);
    if (!tab) return false;

    const exists = await hasSession(tab.sessionName);
    if (exists) return true;

    await createSession(tab.sessionName, 80, 24, tab.cwd);
    if (command) {
      await sendKeys(tab.sessionName, command);
    }
    console.log(`[layout] 탭 세션 재시작: pane=${paneId}, tab=${tabId}, session=${tab.sessionName}${command ? `, command=${command}` : ''}`);
    return true;
  });

export const getFirstPaneTabs = async (wsId: string): Promise<{ tabs: ITab[]; activeTabId: string | null }> =>
  withLock(async () => {
    const layout = await readLayoutFile(resolveLayoutFile(wsId));
    if (!layout) return { tabs: [], activeTabId: null };
    const first = collectPanes(layout.root)[0];
    if (!first) return { tabs: [], activeTabId: null };
    return {
      tabs: [...first.tabs].sort((a, b) => a.order - b.order),
      activeTabId: first.activeTabId,
    };
  });

export const parseSessionName = (sessionName: string): { wsId: string; paneId: string; tabId: string } | null => {
  const match = sessionName.match(/^pt-(ws-.*?)-(pane-.*?)-(tab-.+)$/);
  if (!match) return null;
  return { wsId: match[1], paneId: match[2], tabId: match[3] };
};

export const updateTabClaudeSessionId = async (
  sessionName: string,
  claudeSessionId: string | null,
): Promise<void> => {
  const parsed = parseSessionName(sessionName);
  if (!parsed) return;

  await withLock(async () => {
    const filePath = resolveLayoutFile(parsed.wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return;

    const allTabs = collectAllTabs(layout.root);
    const tab = allTabs.find((t) => t.sessionName === sessionName);
    if (!tab) return;

    tab.claudeSessionId = claudeSessionId;
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);
  });
};

export const updateTabClaudeSummary = async (
  sessionName: string,
  claudeSummary: string | null,
): Promise<void> => {
  const parsed = parseSessionName(sessionName);
  if (!parsed) return;

  await withLock(async () => {
    const filePath = resolveLayoutFile(parsed.wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return;

    const allTabs = collectAllTabs(layout.root);
    const tab = allTabs.find((t) => t.sessionName === sessionName);
    if (!tab) return;

    if (tab.claudeSummary === claudeSummary) return;
    tab.claudeSummary = claudeSummary;
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);
  });
};

export const updateTabCliStatus = async (
  sessionName: string,
  cliState: TCliState,
): Promise<void> => {
  const parsed = parseSessionName(sessionName);
  if (!parsed) return;

  await withLock(async () => {
    const filePath = resolveLayoutFile(parsed.wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return;

    const allTabs = collectAllTabs(layout.root);
    const tab = allTabs.find((t) => t.sessionName === sessionName);
    if (!tab) return;

    if (tab.cliState === cliState) return;
    tab.cliState = cliState;
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);
  });
};

const nextTabName = (tabs: ITab[]): string => {
  const existing = tabs
    .map((t) => t.name)
    .filter((n) => /^Terminal \d+$/.test(n))
    .map((n) => parseInt(n.replace('Terminal ', ''), 10));
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `Terminal ${max + 1}`;
};

const mutate = async (
  wsId: string,
  fn: (layout: ILayoutData) => ILayoutData | null,
): Promise<ILayoutData | null> =>
  withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return null;

    const result = fn(layout);
    if (!result) return null;

    result.updatedAt = new Date().toISOString();
    await writeLayoutFile(result, filePath);
    syncWorkspaceDirectories(wsId, result.root);
    return result;
  });

export const patchLayout = async (
  wsId: string,
  patch: { activePaneId?: string; ratioUpdate?: { path: number[]; ratio: number }; equalize?: boolean },
): Promise<ILayoutData | null> =>
  mutate(wsId, (layout) => {
    if (patch.activePaneId !== undefined) {
      const pane = findPane(layout.root, patch.activePaneId);
      if (!pane) return null;
      layout.activePaneId = patch.activePaneId;
    }
    if (patch.ratioUpdate) {
      layout.root = updateRatioAtPath(layout.root, patch.ratioUpdate.path, patch.ratioUpdate.ratio);
    }
    if (patch.equalize) {
      layout.root = equalizeNode(layout.root);
    }
    return layout;
  });

export const patchPane = async (
  wsId: string,
  paneId: string,
  patch: { activeTabId?: string },
): Promise<ILayoutData | null> =>
  mutate(wsId, (layout) => {
    const pane = findPane(layout.root, paneId);
    if (!pane) return null;
    if (patch.activeTabId !== undefined) {
      if (!pane.tabs.some((t) => t.id === patch.activeTabId)) return null;
      pane.activeTabId = patch.activeTabId;
    }
    return layout;
  });

export const splitPaneInLayout = async (
  wsId: string,
  sourcePaneId: string,
  orientation: 'horizontal' | 'vertical',
  cwd?: string,
  panelType?: string,
): Promise<ILayoutData | null> => {
  const paneId = generatePaneId();
  const tabId = generateTabId();
  const sessionName = workspaceSessionName(wsId, paneId, tabId);

  await createSession(sessionName, 80, 24, cwd);

  const tab: ITab = { id: tabId, sessionName, name: 'Terminal 1', order: 0, ...(cwd ? { cwd } : {}) };
  if (panelType) tab.panelType = panelType as ITab['panelType'];

  const newPane: IPaneNode = { type: 'pane', id: paneId, tabs: [tab], activeTabId: tabId };

  const result = await mutate(wsId, (layout) => {
    const existing = findPane(layout.root, sourcePaneId);
    if (!existing) return null;
    if (cwd) {
      const activeTab = existing.tabs.find((t) => t.id === existing.activeTabId);
      if (activeTab) activeTab.cwd = cwd;
    }
    const splitNode: TLayoutNode = {
      type: 'split',
      orientation,
      ratio: 50,
      children: [{ ...existing }, newPane],
    };
    layout.root = replacePane(layout.root, sourcePaneId, splitNode);
    layout.activePaneId = paneId;
    return layout;
  });

  if (!result) {
    await killSession(sessionName).catch(() => {});
  }

  return result;
};

export const closePaneInLayout = async (wsId: string, paneId: string): Promise<ILayoutData | null> => {
  let sessions: string[] = [];

  const result = await withLock(async () => {
    const filePath = resolveLayoutFile(wsId);
    const layout = await readLayoutFile(filePath);
    if (!layout) return null;

    const pane = findPane(layout.root, paneId);
    if (!pane) return null;
    if (collectPanes(layout.root).length <= 1) return null;

    sessions = pane.tabs.map((t) => t.sessionName);
    removePaneWithFocus(layout, paneId);
    layout.updatedAt = new Date().toISOString();
    await writeLayoutFile(layout, filePath);
    syncWorkspaceDirectories(wsId, layout.root);
    return layout;
  });

  await Promise.all(sessions.map((s) => killSession(s).catch(() => {})));

  return result;
};

export const reorderTabsInPane = async (
  wsId: string,
  paneId: string,
  tabIds: string[],
): Promise<ILayoutData | null> =>
  mutate(wsId, (layout) => {
    const pane = findPane(layout.root, paneId);
    if (!pane) return null;
    const tabMap = new Map(pane.tabs.map((t) => [t.id, t]));
    const reordered = tabIds
      .map((id, i) => {
        const t = tabMap.get(id);
        return t ? { ...t, order: i } : null;
      })
      .filter((t): t is ITab => t !== null);
    if (reordered.length !== pane.tabs.length) return null;
    pane.tabs = reordered;
    return layout;
  });

export const moveTabBetweenPanes = async (
  wsId: string,
  tabId: string,
  fromPaneId: string,
  toPaneId: string,
  toIndex: number,
): Promise<ILayoutData | null> => {
  return mutate(wsId, (layout) => {
    const fromPane = findPane(layout.root, fromPaneId);
    const toPane = findPane(layout.root, toPaneId);
    if (!fromPane || !toPane) return null;

    const tabIdx = fromPane.tabs.findIndex((t) => t.id === tabId);
    if (tabIdx === -1) return null;

    const [tab] = fromPane.tabs.splice(tabIdx, 1);
    if (fromPane.activeTabId === tabId) {
      fromPane.activeTabId = fromPane.tabs[0]?.id ?? null;
    }
    fromPane.tabs.forEach((t, i) => { t.order = i; });

    toPane.tabs.splice(toIndex, 0, tab);
    toPane.tabs.forEach((t, i) => { t.order = i; });
    toPane.activeTabId = tabId;

    if (fromPane.tabs.length === 0 && collectPanes(layout.root).length > 1) {
      removePaneWithFocus(layout, fromPaneId);
    }

    layout.activePaneId = toPaneId;
    return layout;
  });
};

export const patchTab = async (
  wsId: string,
  paneId: string,
  tabId: string,
  patch: Partial<Pick<ITab, 'name' | 'panelType' | 'title' | 'cwd' | 'lastCommand'>>,
): Promise<ILayoutData | null> =>
  mutate(wsId, (layout) => {
    const pane = findPane(layout.root, paneId);
    if (!pane) return null;
    const tab = pane.tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    if (patch.name !== undefined) tab.name = patch.name;
    if (patch.panelType !== undefined) tab.panelType = patch.panelType;
    if (patch.title !== undefined) tab.title = patch.title;
    if (patch.cwd !== undefined) tab.cwd = patch.cwd;
    if (patch.lastCommand !== undefined) tab.lastCommand = patch.lastCommand;
    return layout;
  });
