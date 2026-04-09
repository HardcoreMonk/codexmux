import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';
import type { ITaskHistoryEntry, ITaskHistoryData } from '@/types/task-history';

const log = createLogger('task-history');

const MAX_ENTRIES = 200;
const BASE_DIR = path.join(os.homedir(), '.purplemux');
const TASK_HISTORY_FILE = path.join(BASE_DIR, 'task-history.json');

const g = globalThis as unknown as {
  __purplemuxTaskHistoryLock?: Promise<void>;
  __purplemuxTaskHistoryContentCache?: string;
};
if (!g.__purplemuxTaskHistoryLock) g.__purplemuxTaskHistoryLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__purplemuxTaskHistoryLock!;
  g.__purplemuxTaskHistoryLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const emptyData = (): ITaskHistoryData => ({ version: 1, entries: [] });

const readTaskHistory = async (): Promise<ITaskHistoryData> => {
  let raw: string;
  try {
    raw = await fs.readFile(TASK_HISTORY_FILE, 'utf-8');
  } catch {
    return emptyData();
  }
  try {
    return JSON.parse(raw) as ITaskHistoryData;
  } catch {
    log.warn('Failed to parse task-history.json, starting empty');
    try {
      await fs.copyFile(TASK_HISTORY_FILE, TASK_HISTORY_FILE.replace(/\.json$/, '.json.bak'));
    } catch {}
    return emptyData();
  }
};

const writeTaskHistory = async (data: ITaskHistoryData): Promise<void> => {
  const contentKey = JSON.stringify(data.entries);
  if (g.__purplemuxTaskHistoryContentCache === contentKey) return;

  const tmpFile = TASK_HISTORY_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, TASK_HISTORY_FILE);

  g.__purplemuxTaskHistoryContentCache = contentKey;
};

export const addTaskHistoryEntry = async (entry: ITaskHistoryEntry): Promise<void> => {
  await withLock(async () => {
    const data = await readTaskHistory();
    data.entries.unshift(entry);
    if (data.entries.length > MAX_ENTRIES) {
      data.entries = data.entries.slice(0, MAX_ENTRIES);
    }
    await writeTaskHistory(data);
  });
};

export const updateTaskHistoryDismissedAt = async (
  tabId: string,
  dismissedAt: number,
): Promise<ITaskHistoryEntry | null> => {
  return await withLock(async () => {
    const data = await readTaskHistory();
    const entry = data.entries.find((e) => e.tabId === tabId && e.dismissedAt === null);
    if (!entry) return null;
    entry.dismissedAt = dismissedAt;
    await writeTaskHistory(data);
    return entry;
  });
};

export const getTaskHistory = async (): Promise<ITaskHistoryEntry[]> => {
  const data = await readTaskHistory();
  return data.entries;
};
