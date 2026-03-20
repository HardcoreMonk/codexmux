import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { listSessions, createSession, killSession, defaultSessionName } from '@/lib/tmux';
import type { ITab, TLayoutNode, IPaneNode, ILayoutData } from '@/types/terminal';

const LAYOUT_DIR = path.join(os.homedir(), '.purple-terminal');
const LAYOUT_FILE = path.join(LAYOUT_DIR, 'layout.json');
const TABS_FILE = path.join(LAYOUT_DIR, 'tabs.json');

const g = globalThis as unknown as { __ptLayoutLock?: Promise<void> };
if (!g.__ptLayoutLock) g.__ptLayoutLock = Promise.resolve();

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

const generatePaneId = (): string => `pane-${nanoid(6)}`;
const generateTabId = (): string => `tab-${nanoid(6)}`;

const createDefaultTab = (order = 0): ITab => ({
  id: generateTabId(),
  sessionName: defaultSessionName(),
  name: 'Terminal 1',
  order,
});

const createDefaultPaneNode = (tab: ITab): IPaneNode => ({
  type: 'pane',
  id: generatePaneId(),
  tabs: [tab],
  activeTabId: tab.id,
});

const BACKUP_FILE = path.join(LAYOUT_DIR, '.layout.json.bak');

const readLayout = async (): Promise<ILayoutData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(LAYOUT_FILE, 'utf-8');
  } catch {
    return null;
  }

  try {
    return JSON.parse(raw) as ILayoutData;
  } catch {
    console.log('[layout] layout.json 파싱 실패, 빈 상태로 시작합니다');
    try {
      await fs.copyFile(LAYOUT_FILE, BACKUP_FILE);
      console.log(`[layout] 손상된 파일을 ${BACKUP_FILE}으로 백업했습니다`);
    } catch (backupErr) {
      console.log(`[layout] 백업 실패: ${backupErr instanceof Error ? backupErr.message : backupErr}`);
    }
    return null;
  }
};

const readTabsFile = async (): Promise<{ tabs: ITab[]; activeTabId: string | null } | null> => {
  try {
    const raw = await fs.readFile(TABS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tabs)) return null;
    return { tabs: data.tabs, activeTabId: data.activeTabId ?? null };
  } catch {
    return null;
  }
};

const writeLayout = async (data: ILayoutData): Promise<void> => {
  const tmpFile = LAYOUT_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, LAYOUT_FILE);
};

const collectPanes = (node: TLayoutNode): IPaneNode[] => {
  if (node.type === 'pane') return [node];
  return [...collectPanes(node.children[0]), ...collectPanes(node.children[1])];
};

const collectAllTabs = (node: TLayoutNode): ITab[] =>
  collectPanes(node).flatMap((p) => p.tabs);

const normalizeTree = (node: TLayoutNode): TLayoutNode => {
  if (node.type === 'pane') return node;

  const left = normalizeTree(node.children[0]);
  const right = normalizeTree(node.children[1]);

  if (left.type === 'pane' && left.tabs.length === 0) return right;
  if (right.type === 'pane' && right.tabs.length === 0) return left;

  return { ...node, children: [left, right] };
};

const migrateFromTabs = async (): Promise<ILayoutData | null> => {
  const tabsData = await readTabsFile();
  if (!tabsData || tabsData.tabs.length === 0) return null;

  const paneId = generatePaneId();
  const layout: ILayoutData = {
    root: {
      type: 'pane',
      id: paneId,
      tabs: tabsData.tabs,
      activeTabId: tabsData.activeTabId,
    },
    focusedPaneId: paneId,
    updatedAt: new Date().toISOString(),
  };

  console.log(`[layout] tabs.json에서 마이그레이션 완료 (탭 ${tabsData.tabs.length}개 → 단일 Pane)`);
  return layout;
};

const crossCheckWithTmux = async (layout: ILayoutData): Promise<boolean> => {
  let changed = false;
  const tmuxSessions = await listSessions();
  const tmuxSet = new Set(tmuxSessions);

  const panes = collectPanes(layout.root);
  const layoutSessions = new Set<string>();

  for (const pane of panes) {
    const before = pane.tabs.length;
    pane.tabs = pane.tabs.filter((tab) => {
      layoutSessions.add(tab.sessionName);
      return tmuxSet.has(tab.sessionName);
    });
    if (pane.tabs.length !== before) {
      changed = true;
      if (pane.activeTabId && !pane.tabs.some((t) => t.id === pane.activeTabId)) {
        pane.activeTabId = pane.tabs[0]?.id ?? null;
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

  const emptyPanes = panes.filter((p) => p.tabs.length === 0);
  if (emptyPanes.length > 0) {
    changed = true;
    if (panes.length === 1 && emptyPanes.length === 1) {
      const tab = createDefaultTab();
      await createSession(tab.sessionName, 80, 24);
      emptyPanes[0].tabs.push(tab);
      emptyPanes[0].activeTabId = tab.id;
    } else {
      for (const emptyPane of emptyPanes) {
        emptyPane.tabs = [];
      }
      layout.root = normalizeTree(layout.root);
    }
  }

  if (changed) {
    layout.updatedAt = new Date().toISOString();
    const finalPanes = collectPanes(layout.root);
    if (layout.focusedPaneId && !finalPanes.some((p) => p.id === layout.focusedPaneId)) {
      layout.focusedPaneId = finalPanes[0]?.id ?? null;
    }
  }

  const totalTabs = collectAllTabs(layout.root).length;
  const finalPanes = collectPanes(layout.root);
  console.log(`[layout] tmux 정합성 체크: ${tmuxSessions.length} 세션 확인, ${orphans.length} orphan, ${changed ? '변경됨' : '변경없음'}`);
  console.log(`[layout] 레이아웃 준비 완료 (Pane ${finalPanes.length}개, 탭 ${totalTabs}개)`);

  return changed;
};

export const initLayoutStore = async (): Promise<void> => {
  await fs.mkdir(LAYOUT_DIR, { recursive: true });

  console.log('[layout] layout.json 로드 중...');

  let layout = await readLayout();

  if (!layout) {
    const backupExists = await fs.access(LAYOUT_FILE).then(() => true).catch(() => false);
    if (!backupExists) {
      layout = await migrateFromTabs();
    }
  }

  if (layout) {
    try {
      const changed = await crossCheckWithTmux(layout);
      if (changed) {
        await writeLayout(layout);
      }
    } catch (err) {
      console.log(`[layout] tmux 정합성 체크 실패, layout.json 그대로 사용: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.log('[layout] 레이아웃 없음, 첫 GET 요청 시 기본 Pane 생성 대기');
  }
};

export const getLayout = async (): Promise<ILayoutData> =>
  withLock(async () => {
    const existing = await readLayout();
    if (existing) return existing;

    const tab = createDefaultTab();
    await createSession(tab.sessionName, 80, 24);

    const pane = createDefaultPaneNode(tab);
    const layout: ILayoutData = {
      root: pane,
      focusedPaneId: pane.id,
      updatedAt: new Date().toISOString(),
    };
    await writeLayout(layout);
    console.log(`[layout] 기본 레이아웃 생성 (pane: ${pane.id}, tab: ${tab.id})`);
    return layout;
  });

export interface ILayoutValidationError {
  error: string;
}

const validateTree = (root: TLayoutNode, focusedPaneId: string | null): ILayoutValidationError | null => {
  const paneIds = new Set<string>();
  const tabIds = new Set<string>();
  let paneCount = 0;

  const walk = (node: TLayoutNode): string | null => {
    if (node.type === 'split') {
      if (!Array.isArray(node.children) || node.children.length !== 2) {
        return 'split 노드는 2개 자식 필수';
      }
      const leftErr = walk(node.children[0]);
      if (leftErr) return leftErr;
      return walk(node.children[1]);
    }

    if (node.type === 'pane') {
      paneCount++;
      if (paneIds.has(node.id)) return '중복 Pane ID';
      paneIds.add(node.id);

      if (!Array.isArray(node.tabs)) return 'pane 노드에 tabs 필드 필수';

      for (const tab of node.tabs) {
        if (tabIds.has(tab.id)) return '중복 탭 ID';
        tabIds.add(tab.id);
      }
      return null;
    }

    return '알 수 없는 노드 타입';
  };

  const err = walk(root);
  if (err) return { error: err };

  if (paneCount > 10) return { error: '최대 Pane 수(10개) 초과' };

  if (focusedPaneId && !paneIds.has(focusedPaneId)) {
    return { error: '유효하지 않은 focusedPaneId' };
  }

  return null;
};

export const updateLayout = async (
  root: TLayoutNode,
  focusedPaneId: string | null,
): Promise<ILayoutData | ILayoutValidationError> =>
  withLock(async () => {
    const validationError = validateTree(root, focusedPaneId);
    if (validationError) return validationError;

    const normalized = normalizeTree(root);
    const layout: ILayoutData = {
      root: normalized,
      focusedPaneId,
      updatedAt: new Date().toISOString(),
    };
    await writeLayout(layout);
    return layout;
  });

export const createPane = async (cwd?: string): Promise<{ paneId: string; tab: ITab }> => {
  const paneId = generatePaneId();
  const tabId = generateTabId();
  const sessionName = defaultSessionName();

  await createSession(sessionName, 80, 24, cwd);

  const tab: ITab = { id: tabId, sessionName, name: 'Terminal 1', order: 0 };
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

export const addTabToPane = async (paneId: string, name?: string): Promise<ITab | null> =>
  withLock(async () => {
    const layout = await readLayout();
    if (!layout) return null;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return null;

    const tabId = generateTabId();
    const sessionName = defaultSessionName();
    await createSession(sessionName, 80, 24);

    const nextOrder = pane.tabs.length > 0 ? Math.max(...pane.tabs.map((t) => t.order)) + 1 : 0;
    const tabName = name?.trim() || nextTabName(pane.tabs);
    const tab: ITab = { id: tabId, sessionName, name: tabName, order: nextOrder };

    pane.tabs.push(tab);
    pane.activeTabId = tabId;
    layout.updatedAt = new Date().toISOString();
    await writeLayout(layout);

    console.log(`[layout] 탭 추가: pane=${paneId}, tab=${tabId}, session=${sessionName}`);
    return tab;
  });

export const removeTabFromPane = async (paneId: string, tabId: string): Promise<boolean> =>
  withLock(async () => {
    const layout = await readLayout();
    if (!layout) return false;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return false;

    const idx = pane.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return false;

    const tab = pane.tabs[idx];
    pane.tabs.splice(idx, 1);

    try {
      await killSession(tab.sessionName);
    } catch {
      // session already gone
    }

    if (pane.activeTabId === tabId) {
      pane.activeTabId = pane.tabs[0]?.id ?? null;
    }

    pane.tabs.forEach((t, i) => { t.order = i; });
    layout.updatedAt = new Date().toISOString();
    await writeLayout(layout);

    console.log(`[layout] 탭 삭제: pane=${paneId}, tab=${tabId}`);
    return true;
  });

export const renameTabInPane = async (paneId: string, tabId: string, name: string): Promise<ITab | null> =>
  withLock(async () => {
    const layout = await readLayout();
    if (!layout) return null;

    const pane = collectPanes(layout.root).find((p) => p.id === paneId);
    if (!pane) return null;

    const tab = pane.tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    tab.name = name;
    layout.updatedAt = new Date().toISOString();
    await writeLayout(layout);

    console.log(`[layout] 탭 이름 변경: pane=${paneId}, tab=${tabId} → "${name}"`);
    return { ...tab };
  });

export const getFirstPaneTabs = async (): Promise<{ tabs: ITab[]; activeTabId: string | null }> =>
  withLock(async () => {
    const layout = await readLayout();
    if (!layout) return { tabs: [], activeTabId: null };
    const first = collectPanes(layout.root)[0];
    if (!first) return { tabs: [], activeTabId: null };
    return {
      tabs: [...first.tabs].sort((a, b) => a.order - b.order),
      activeTabId: first.activeTabId,
    };
  });

const nextTabName = (tabs: ITab[]): string => {
  const existing = tabs
    .map((t) => t.name)
    .filter((n) => /^Terminal \d+$/.test(n))
    .map((n) => parseInt(n.replace('Terminal ', ''), 10));
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `Terminal ${max + 1}`;
};
