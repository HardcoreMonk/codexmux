import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { resolveLayoutDir } from '@/lib/layout-store';
import type { IHistoryEntry, IMessageHistoryFile } from '@/types/message-history';

const MAX_ENTRIES = 500;

const g = globalThis as unknown as {
  __ptMessageHistoryLocks?: Map<string, Promise<void>>;
};
if (!g.__ptMessageHistoryLocks) g.__ptMessageHistoryLocks = new Map();

const withLock = async <T>(wsId: string, fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__ptMessageHistoryLocks!.get(wsId) ?? Promise.resolve();
  g.__ptMessageHistoryLocks!.set(wsId, next);
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (g.__ptMessageHistoryLocks!.get(wsId) === next) {
      g.__ptMessageHistoryLocks!.delete(wsId);
    }
  }
};

const resolveHistoryPath = (wsId: string): string =>
  path.join(resolveLayoutDir(wsId), 'message-history.json');

const readFile = async (filePath: string): Promise<IHistoryEntry[]> => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as IMessageHistoryFile;
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[message-history] failed to read:', e);
    }
    return [];
  }
};

const writeFile = async (filePath: string, data: IMessageHistoryFile): Promise<void> => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = filePath + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  await fs.rename(tmpFile, filePath);
};

export const readMessageHistory = async (wsId: string): Promise<IHistoryEntry[]> => {
  return readFile(resolveHistoryPath(wsId));
};

export const addMessageHistory = async (wsId: string, message: string): Promise<IHistoryEntry> => {
  return withLock(wsId, async () => {
    const filePath = resolveHistoryPath(wsId);
    const entries = await readFile(filePath);

    const dupeIndex = entries.findIndex((e) => e.message === message);
    if (dupeIndex !== -1) entries.splice(dupeIndex, 1);

    const entry: IHistoryEntry = {
      id: nanoid(),
      message,
      sentAt: new Date().toISOString(),
    };
    entries.unshift(entry);

    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

    await writeFile(filePath, { entries });
    return entry;
  });
};

export const deleteMessageHistory = async (wsId: string, id: string): Promise<boolean> => {
  return withLock(wsId, async () => {
    const filePath = resolveHistoryPath(wsId);
    const entries = await readFile(filePath);
    const filtered = entries.filter((e) => e.id !== id);
    await writeFile(filePath, { entries: filtered });
    return true;
  });
};
