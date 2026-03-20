import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { listSessions, createSession, killSession, defaultSessionName } from '@/lib/tmux';
import type { ITab } from '@/types/terminal';

interface ITabStore {
  tabs: ITab[];
  activeTabId: string | null;
}

interface ITabsFile {
  tabs: ITab[];
  activeTabId: string | null;
  updatedAt: string;
}

const TABS_DIR = path.join(os.homedir(), '.purple-terminal');
const TABS_FILE = path.join(TABS_DIR, 'tabs.json');

const g = globalThis as unknown as { __ptTabLock?: Promise<void> };
if (!g.__ptTabLock) g.__ptTabLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__ptTabLock!;
  g.__ptTabLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const readStore = async (): Promise<ITabStore> => {
  try {
    const raw = await fs.readFile(TABS_FILE, 'utf-8');
    const data = JSON.parse(raw) as ITabsFile;
    return {
      tabs: Array.isArray(data.tabs) ? data.tabs : [],
      activeTabId: data.activeTabId ?? null,
    };
  } catch {
    return { tabs: [], activeTabId: null };
  }
};

const writeStore = async (store: ITabStore): Promise<void> => {
  const data: ITabsFile = { ...store, updatedAt: new Date().toISOString() };
  const tmpFile = TABS_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, TABS_FILE);
};

const fixActiveTab = (store: ITabStore, removedTabId: string): void => {
  if (store.tabs.length === 0) {
    store.activeTabId = null;
  } else if (store.activeTabId === removedTabId) {
    store.activeTabId = store.tabs[0]?.id ?? null;
  }
};

export const flushToDisk = async () => {};

export const initTabStore = async () => {
  await fs.mkdir(TABS_DIR, { recursive: true });

  const store = await readStore();
  const tmuxSessions = await listSessions();
  const tabSessions = new Set(store.tabs.map((t) => t.sessionName));

  const staleTabs = store.tabs.filter((tab) => !tmuxSessions.includes(tab.sessionName));
  store.tabs = store.tabs.filter((tab) => tmuxSessions.includes(tab.sessionName));

  const orphans = tmuxSessions.filter((s) => !tabSessions.has(s));
  const results = await Promise.allSettled(orphans.map((s) => killSession(s)));
  const killedCount = results.filter((r) => r.status === 'fulfilled').length;

  if (store.activeTabId && !store.tabs.some((t) => t.id === store.activeTabId)) {
    store.activeTabId = store.tabs[0]?.id ?? null;
  }

  await writeStore(store);
  console.log(`[tabs] sync: removed ${staleTabs.length} stale, killed ${killedCount} orphan`);
  console.log(`[tabs] list: ${store.tabs.length} tabs`);
};

export const getTabs = async (): Promise<{ tabs: ITab[]; activeTabId: string | null }> => {
  const store = await readStore();
  return {
    tabs: [...store.tabs].sort((a, b) => a.order - b.order),
    activeTabId: store.activeTabId,
  };
};

const nextTabName = (tabs: ITab[]): string => {
  const existing = tabs
    .map((t) => t.name)
    .filter((n) => /^Terminal \d+$/.test(n))
    .map((n) => parseInt(n.replace('Terminal ', ''), 10));
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `Terminal ${max + 1}`;
};

export const addTab = async (name?: string): Promise<ITab> => {
  const tabId = `tab-${nanoid(6)}`;
  const sessionName = defaultSessionName();

  const store = await withLock(async () => {
    const s = await readStore();
    return {
      tabName: name?.trim() || nextTabName(s.tabs),
      order: s.tabs.length > 0 ? Math.max(...s.tabs.map((t) => t.order)) + 1 : 0,
    };
  });

  await createSession(sessionName, 80, 24);

  return withLock(async () => {
    const s = await readStore();
    const tab: ITab = { id: tabId, sessionName, name: store.tabName, order: store.order };
    s.tabs.push(tab);
    s.activeTabId = tabId;
    await writeStore(s);

    console.log(`[tabs] created: ${tabId} (session: ${sessionName})`);
    return tab;
  });
};

export const removeTab = async (tabId: string): Promise<boolean> => {
  const sessionName = await withLock(async () => {
    const store = await readStore();
    const idx = store.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return null;

    const tab = store.tabs[idx];
    store.tabs.splice(idx, 1);
    fixActiveTab(store, tabId);
    await writeStore(store);

    console.log(`[tabs] deleted: ${tabId}`);
    return tab.sessionName;
  });

  if (sessionName === null) return false;

  try {
    await killSession(sessionName);
  } catch {
    // session already gone
  }
  return true;
};

export const removeTabBySession = async (sessionName: string): Promise<boolean> =>
  withLock(async () => {
    const store = await readStore();
    const idx = store.tabs.findIndex((t) => t.sessionName === sessionName);
    if (idx === -1) return false;

    const tab = store.tabs[idx];
    store.tabs.splice(idx, 1);
    fixActiveTab(store, tab.id);
    await writeStore(store);

    console.log(`[tabs] deleted by session exit: ${tab.id}`);
    return true;
  });

export const renameTab = async (tabId: string, name: string): Promise<ITab | null> =>
  withLock(async () => {
    const store = await readStore();
    const tab = store.tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    tab.name = name;
    await writeStore(store);

    console.log(`[tabs] renamed: ${tabId} → "${name}"`);
    return { ...tab };
  });

export const reorderTabs = async (tabIds: string[]): Promise<ITab[] | null> =>
  withLock(async () => {
    const store = await readStore();
    const currentIds = new Set(store.tabs.map((t) => t.id));
    const newIds = new Set(tabIds);

    if (currentIds.size !== newIds.size || ![...currentIds].every((id) => newIds.has(id))) {
      return null;
    }

    for (let i = 0; i < tabIds.length; i++) {
      const tab = store.tabs.find((t) => t.id === tabIds[i]);
      if (tab) tab.order = i;
    }

    await writeStore(store);
    console.log(`[tabs] reordered: ${store.tabs.length} tabs`);

    return [...store.tabs].sort((a, b) => a.order - b.order);
  });

export const setActiveTab = async (tabId: string): Promise<void> =>
  withLock(async () => {
    const store = await readStore();
    if (store.activeTabId === tabId) return;
    if (!store.tabs.some((t) => t.id === tabId)) return;
    store.activeTabId = tabId;
    await writeStore(store);
  });
