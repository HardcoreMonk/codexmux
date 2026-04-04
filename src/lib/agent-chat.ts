import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import type { IChatMessage, IChatIndex } from '@/types/agent';

const log = createLogger('agent-chat');

const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');

export const getAgentDir = (agentId: string): string =>
  path.join(AGENTS_DIR, agentId);

export const getChatDir = (agentId: string): string =>
  path.join(AGENTS_DIR, agentId, 'chat');

const getIndexPath = (agentId: string): string =>
  path.join(getChatDir(agentId), 'index.json');

const getSessionPath = (agentId: string, sessionId: string): string =>
  path.join(getChatDir(agentId), `${sessionId}.jsonl`);

export const ensureAgentDir = async (agentId: string): Promise<void> => {
  await fs.mkdir(getChatDir(agentId), { recursive: true });
};

export const readChatIndex = async (agentId: string): Promise<IChatIndex> => {
  try {
    const raw = await fs.readFile(getIndexPath(agentId), 'utf-8');
    return JSON.parse(raw) as IChatIndex;
  } catch {
    return { sessions: [] };
  }
};

export const writeChatIndex = async (agentId: string, index: IChatIndex): Promise<void> => {
  await fs.writeFile(getIndexPath(agentId), JSON.stringify(index, null, 2), 'utf-8');
};

export const createChatSession = async (agentId: string): Promise<string> => {
  const sessionId = nanoid(12);
  const now = new Date().toISOString();
  const index = await readChatIndex(agentId);
  index.sessions.push({
    id: sessionId,
    agentId,
    createdAt: now,
    lastMessageAt: now,
  });
  await writeChatIndex(agentId, index);
  await fs.writeFile(getSessionPath(agentId, sessionId), '', 'utf-8');
  return sessionId;
};

export const getLatestSessionId = async (agentId: string): Promise<string | null> => {
  const index = await readChatIndex(agentId);
  if (index.sessions.length === 0) return null;
  return index.sessions[index.sessions.length - 1].id;
};

export const appendMessage = async (
  agentId: string,
  sessionId: string,
  message: IChatMessage,
): Promise<void> => {
  const line = JSON.stringify(message) + '\n';
  await fs.appendFile(getSessionPath(agentId, sessionId), line, 'utf-8');

  const index = await readChatIndex(agentId);
  const session = index.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.lastMessageAt = message.timestamp;
    await writeChatIndex(agentId, index);
  }
};

export const createMessage = (
  role: 'user' | 'agent',
  type: IChatMessage['type'],
  content: string,
  metadata?: Record<string, unknown>,
): IChatMessage => ({
  id: nanoid(16),
  timestamp: new Date().toISOString(),
  role,
  type,
  content,
  metadata,
});

export const readMessages = async (
  agentId: string,
  sessionId: string,
  opts?: { limit?: number; before?: string },
): Promise<{ messages: IChatMessage[]; hasMore: boolean }> => {
  const limit = opts?.limit ?? 50;
  const before = opts?.before;

  let raw: string;
  try {
    raw = await fs.readFile(getSessionPath(agentId, sessionId), 'utf-8');
  } catch {
    return { messages: [], hasMore: false };
  }

  const lines = raw.trim().split('\n').filter(Boolean);
  const allMessages: IChatMessage[] = [];
  for (const line of lines) {
    try {
      allMessages.push(JSON.parse(line) as IChatMessage);
    } catch {
      log.warn(`invalid jsonl line in ${agentId}/${sessionId}`);
    }
  }

  let filtered = allMessages;
  if (before) {
    const idx = filtered.findIndex((m) => m.id === before);
    if (idx > 0) {
      filtered = filtered.slice(0, idx);
    }
  }

  const hasMore = filtered.length > limit;
  const messages = filtered.slice(-limit);

  return { messages, hasMore };
};

export const removeAgentDir = async (agentId: string): Promise<void> => {
  try {
    await fs.rm(getAgentDir(agentId), { recursive: true, force: true });
  } catch (err) {
    log.error(`failed to remove agent dir ${agentId}: ${err instanceof Error ? err.message : err}`);
  }
};

// --- Memory ---

const getMemoryDir = (agentId: string): string =>
  path.join(AGENTS_DIR, agentId, 'memory');

export interface IMemoryEntry {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export const ensureMemoryDir = async (agentId: string): Promise<void> => {
  await fs.mkdir(getMemoryDir(agentId), { recursive: true });
};

export const saveMemoryEntry = async (
  agentId: string,
  content: string,
  tags: string[],
): Promise<IMemoryEntry> => {
  await ensureMemoryDir(agentId);
  const id = nanoid(12);
  const entry: IMemoryEntry = {
    id,
    content,
    tags,
    createdAt: new Date().toISOString(),
  };
  const frontmatter = [
    '---',
    `id: ${entry.id}`,
    `tags: ${entry.tags.join(', ')}`,
    `createdAt: ${entry.createdAt}`,
    '---',
    '',
    entry.content,
    '',
  ].join('\n');
  await fs.writeFile(path.join(getMemoryDir(agentId), `${id}.md`), frontmatter, 'utf-8');
  return entry;
};

const parseMemoryFile = (raw: string, fileName: string): IMemoryEntry | null => {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const content = match[2].trimEnd();
  let id = fileName.replace(/\.md$/, '');
  let tags: string[] = [];
  let createdAt = '';

  for (const line of frontmatter.split('\n')) {
    if (line.startsWith('id: ')) id = line.slice(4).trim();
    else if (line.startsWith('tags: ')) tags = line.slice(6).split(',').map((t) => t.trim()).filter(Boolean);
    else if (line.startsWith('createdAt: ')) createdAt = line.slice(11).trim();
  }

  return { id, content, tags, createdAt };
};

export const listMemoryEntries = async (
  agentId: string,
  query?: string,
  tag?: string,
): Promise<IMemoryEntry[]> => {
  const dir = getMemoryDir(agentId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const entries: IMemoryEntry[] = [];
  const lowerQuery = query?.toLowerCase();

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8');
      const entry = parseMemoryFile(raw, file);
      if (!entry) continue;

      if (tag && !entry.tags.includes(tag)) continue;
      if (lowerQuery && !entry.content.toLowerCase().includes(lowerQuery)) continue;

      entries.push(entry);
    } catch {
      // skip unreadable
    }
  }

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries;
};

export const getMemoryEntry = async (
  agentId: string,
  memoryId: string,
): Promise<IMemoryEntry | null> => {
  const filePath = path.join(getMemoryDir(agentId), `${memoryId}.md`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return parseMemoryFile(raw, `${memoryId}.md`);
  } catch {
    return null;
  }
};

export const deleteMemoryEntry = async (
  agentId: string,
  memoryId: string,
): Promise<boolean> => {
  const filePath = path.join(getMemoryDir(agentId), `${memoryId}.md`);
  try {
    await fs.rm(filePath);
    return true;
  } catch {
    return false;
  }
};
