import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const BASE_DIR = path.join(os.homedir(), '.codexmux');
export const REMOTE_CODEX_DIR = path.join(BASE_DIR, 'remote', 'codex');

const CODEX_THREAD_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const MAX_SOURCE_ID_LENGTH = 80;

export interface IRemoteCodexSyncInput {
  sourceId?: string | null;
  host?: string | null;
  shell?: string | null;
  cwd?: string | null;
  windowsPath?: string | null;
  sessionId?: string | null;
  startedAt?: string | null;
  mtimeMs?: number | null;
  offset: number;
  reset?: boolean;
  content: Buffer;
}

export interface IRemoteCodexSyncResult {
  sessionId: string;
  jsonlPath: string;
  expectedOffset: number;
  offset: number;
  sourceId: string;
}

export interface IRemoteCodexSidecar {
  version: 1;
  sourceId: string;
  host: string | null;
  shell: string | null;
  cwd: string | null;
  windowsPath: string | null;
  sessionId: string;
  startedAt: string | null;
  lastActivityAt: string;
  remoteOffset: number;
  mtimeMs: number | null;
  updatedAt: string;
}

interface IExtractedCodexMeta {
  sessionId: string | null;
  cwd: string | null;
  startedAt: string | null;
}

const safeSegment = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SOURCE_ID_LENGTH);
  return normalized || 'windows';
};

export const sanitizeRemoteCodexSourceId = (value: string | null | undefined): string =>
  safeSegment(value || 'windows');

const extractThreadId = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.match(CODEX_THREAD_ID_RE)?.[1] ?? null;
};

const parseIsoDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const extractCodexMeta = (content: Buffer): IExtractedCodexMeta => {
  const text = content.toString('utf-8');
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let startedAt: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (!startedAt && typeof record.timestamp === 'string') {
        startedAt = parseIsoDate(record.timestamp);
      }

      const payload = record.payload;
      if (record.type !== 'session_meta' || !payload || typeof payload !== 'object') continue;
      const meta = payload as Record<string, unknown>;
      if (typeof meta.id === 'string') sessionId = extractThreadId(meta.id) ?? meta.id;
      if (typeof meta.cwd === 'string') cwd = meta.cwd;
      if (typeof meta.timestamp === 'string') startedAt = parseIsoDate(meta.timestamp) ?? startedAt;
      break;
    } catch {
      continue;
    }
  }

  return { sessionId, cwd, startedAt };
};

const resolveRemoteJsonlPath = (sourceId: string, sessionId: string): string =>
  path.join(REMOTE_CODEX_DIR, sourceId, `${sessionId}.jsonl`);

const sidecarPath = (jsonlPath: string): string => `${jsonlPath}.meta.json`;

export const isRemoteCodexJsonlPath = (filePath: string): boolean => {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(REMOTE_CODEX_DIR + path.sep) && resolved.endsWith('.jsonl');
};

export const readRemoteCodexSidecar = async (jsonlPath: string): Promise<IRemoteCodexSidecar | null> => {
  try {
    const raw = await fs.readFile(sidecarPath(jsonlPath), 'utf-8');
    const parsed = JSON.parse(raw) as IRemoteCodexSidecar;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
};

const writeSidecar = async (jsonlPath: string, sidecar: IRemoteCodexSidecar): Promise<void> => {
  const filePath = sidecarPath(jsonlPath);
  await fs.writeFile(filePath, JSON.stringify(sidecar, null, 2), { mode: 0o600 });
};

export const writeRemoteCodexChunk = async (input: IRemoteCodexSyncInput): Promise<IRemoteCodexSyncResult> => {
  const sourceId = sanitizeRemoteCodexSourceId(input.sourceId || input.host || 'windows');
  const extracted = extractCodexMeta(input.content);
  const sessionId =
    extractThreadId(input.sessionId)
    ?? extracted.sessionId
    ?? extractThreadId(input.windowsPath);

  if (!sessionId) {
    throw new Error('missing-session-id');
  }

  const safeSessionId = safeSegment(sessionId);
  const jsonlPath = resolveRemoteJsonlPath(sourceId, safeSessionId);
  await fs.mkdir(path.dirname(jsonlPath), { recursive: true });

  const previous = await readRemoteCodexSidecar(jsonlPath);
  const expectedOffset = previous?.remoteOffset ?? 0;
  const isReset = input.reset || input.offset === 0;

  if ((!previous && input.offset !== 0) || (!isReset && input.offset !== expectedOffset)) {
    const err = new Error('offset-mismatch') as Error & { expectedOffset?: number };
    err.expectedOffset = expectedOffset;
    throw err;
  }

  if (isReset) {
    await fs.writeFile(jsonlPath, input.content, { mode: 0o600 });
  } else {
    await fs.appendFile(jsonlPath, input.content);
  }

  const nextOffset = input.offset + input.content.length;
  const now = new Date().toISOString();
  const startedAt =
    parseIsoDate(input.startedAt)
    ?? extracted.startedAt
    ?? previous?.startedAt
    ?? null;

  const sidecar: IRemoteCodexSidecar = {
    version: 1,
    sourceId,
    host: input.host?.trim() || previous?.host || null,
    shell: input.shell?.trim() || previous?.shell || 'pwsh',
    cwd: input.cwd?.trim() || extracted.cwd || previous?.cwd || null,
    windowsPath: input.windowsPath?.trim() || previous?.windowsPath || null,
    sessionId,
    startedAt,
    lastActivityAt: input.mtimeMs ? new Date(input.mtimeMs).toISOString() : now,
    remoteOffset: nextOffset,
    mtimeMs: input.mtimeMs ?? previous?.mtimeMs ?? null,
    updatedAt: now,
  };
  await writeSidecar(jsonlPath, sidecar);

  return {
    sessionId,
    jsonlPath,
    expectedOffset,
    offset: nextOffset,
    sourceId,
  };
};

export const collectRemoteCodexJsonlFiles = async (dir = REMOTE_CODEX_DIR, depth = 0): Promise<string[]> => {
  if (depth > 2) return [];

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRemoteCodexJsonlFiles(fullPath, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files;
};
