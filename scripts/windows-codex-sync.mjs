#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEFAULT_INTERVAL_MS = 1500;
const MAX_CHUNK_BYTES = 512 * 1024;
const CODEX_THREAD_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const args = process.argv.slice(2);

const readArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const die = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const normalizeServer = (value) => {
  if (!value) return '';
  const raw = String(value).trim().replace(/\/+$/, '');
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const parseSinceHours = (value) => {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'all' || raw === '0') return null;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours > 0 ? hours : NaN;
};

const serverUrl = normalizeServer(readArg('server') || process.env.CMUX_URL || process.env.CODEXMUX_URL);
const token = readArg('token') || process.env.CMUX_TOKEN || process.env.CODEXMUX_TOKEN;
const sourceId = readArg('source-id') || process.env.CMUX_SOURCE_ID || os.hostname();
const shellName = readArg('shell') || process.env.CMUX_SHELL || 'pwsh';
const codexDir = path.resolve(
  readArg('codex-dir')
  || process.env.CODEX_SESSIONS_DIR
  || path.join(os.homedir(), '.codex', 'sessions'),
);
const intervalMs = Number(readArg('interval-ms') || DEFAULT_INTERVAL_MS);
const sinceHours = parseSinceHours(readArg('since-hours') || process.env.CMUX_SINCE_HOURS);
const stateFile = path.resolve(
  readArg('state-file')
  || process.env.CMUX_SYNC_STATE
  || path.join(os.homedir(), '.codexmux', 'windows-codex-sync-state.json'),
);
const once = hasFlag('once');

if (!serverUrl) die('Missing --server or CMUX_URL');
if (!token) die('Missing --token or CMUX_TOKEN');
if (!Number.isFinite(intervalMs) || intervalMs < 500) die('--interval-ms must be >= 500');
if (Number.isNaN(sinceHours)) die('--since-hours must be a positive number, 0, or all');

const state = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadState = async () => {
  let raw;
  try {
    raw = await fs.readFile(stateFile, 'utf-8');
  } catch {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const files = parsed?.files;
    if (!files || typeof files !== 'object') return;
    for (const [filePath, entry] of Object.entries(files)) {
      if (!entry || typeof entry !== 'object') continue;
      if (!Number.isFinite(entry.offset) || entry.offset < 0) continue;
      state.set(filePath, {
        offset: entry.offset,
        sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : null,
        meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : { cwd: null, startedAt: null },
      });
    }
  } catch (err) {
    process.stderr.write(`[warn] failed to read state file ${stateFile}: ${err instanceof Error ? err.message : err}\n`);
  }
};

const saveState = async () => {
  try {
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    const tmp = `${stateFile}.${process.pid}.tmp`;
    await fs.writeFile(
      tmp,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        files: Object.fromEntries(state),
      }, null, 2),
      { mode: 0o600 },
    );
    await fs.rename(tmp, stateFile);
  } catch (err) {
    process.stderr.write(`[warn] failed to write state file ${stateFile}: ${err instanceof Error ? err.message : err}\n`);
  }
};

const collectJsonlFiles = async (dir, depth = 0) => {
  if (depth > 5) return [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonlFiles(fullPath, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files;
};

const extractSessionId = async (filePath, buffer) => {
  const fromName = path.basename(filePath, '.jsonl').match(CODEX_THREAD_ID_RE)?.[1];
  if (fromName) return fromName;

  const text = buffer.toString('utf-8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      const id = record?.payload?.id;
      if (record?.type === 'session_meta' && typeof id === 'string') {
        return id.match(CODEX_THREAD_ID_RE)?.[1] || id;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const extractCwdAndStartedAt = (buffer) => {
  const text = buffer.toString('utf-8');
  let startedAt = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (!startedAt && typeof record?.timestamp === 'string') startedAt = record.timestamp;
      if (record?.type !== 'session_meta') continue;
      return {
        cwd: typeof record.payload?.cwd === 'string' ? record.payload.cwd : null,
        startedAt: typeof record.payload?.timestamp === 'string' ? record.payload.timestamp : startedAt,
      };
    } catch {
      continue;
    }
  }
  return { cwd: null, startedAt };
};

const postChunk = async ({
  filePath,
  stat,
  sessionId,
  cwd,
  startedAt,
  offset,
  reset,
  chunk,
}) => {
  const response = await fetch(`${serverUrl}/api/remote/codex/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cmux-token': token,
    },
    body: JSON.stringify({
      sourceId,
      host: os.hostname(),
      shell: shellName,
      cwd,
      windowsPath: filePath,
      sessionId,
      startedAt,
      mtimeMs: stat.mtimeMs,
      offset,
      reset,
      contentBase64: chunk.toString('base64'),
    }),
  });

  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, offsetMismatch: true, expectedOffset: body.expectedOffset ?? 0 };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`sync failed ${response.status}: ${body.slice(0, 200)}`);
  }
  return { ok: true };
};

const syncFile = async (filePath, stat) => {
  const prev = state.get(filePath);
  const reset = !prev || stat.size < prev.offset;
  const startOffset = reset ? 0 : prev.offset;
  if (!reset && stat.size === startOffset) return;

  const handle = await fs.open(filePath, 'r');
  try {
    const firstChunkSize = Math.min(stat.size, MAX_CHUNK_BYTES);
    const firstChunk = Buffer.alloc(firstChunkSize);
    if (firstChunkSize > 0) {
      await handle.read(firstChunk, 0, firstChunkSize, 0);
    }
    const sessionId = prev?.sessionId || await extractSessionId(filePath, firstChunk);
    if (!sessionId) {
      process.stderr.write(`[skip] no session id: ${filePath}\n`);
      return;
    }
    const meta = reset ? extractCwdAndStartedAt(firstChunk) : (prev?.meta || { cwd: null, startedAt: null });

    let offset = startOffset;
    while (offset < stat.size) {
      const size = Math.min(MAX_CHUNK_BYTES, stat.size - offset);
      const chunk = Buffer.alloc(size);
      await handle.read(chunk, 0, size, offset);
      const result = await postChunk({
        filePath,
        stat,
        sessionId,
        cwd: meta.cwd,
        startedAt: meta.startedAt,
        offset,
        reset: reset && offset === 0,
        chunk,
      });
      if (!result.ok && result.offsetMismatch) {
        state.delete(filePath);
        await saveState();
        process.stderr.write(`[retry] offset mismatch for ${filePath}; server expected ${result.expectedOffset}\n`);
        return syncFile(filePath, stat);
      }
      offset += size;
    }

    state.set(filePath, { offset: stat.size, sessionId, meta });
    await saveState();
    process.stdout.write(`[synced] ${sessionId} ${stat.size} bytes ${filePath}\n`);
  } finally {
    await handle.close();
  }
};

const scanOnce = async () => {
  const cutoff = sinceHours === null ? 0 : Date.now() - sinceHours * 60 * 60 * 1000;
  const files = await collectJsonlFiles(codexDir);
  const candidates = [];
  for (const file of files) {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.mtimeMs < cutoff) continue;
    candidates.push({ file, stat });
  }
  candidates.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);

  for (const { file, stat } of candidates) {
    await syncFile(file, stat).catch((err) => {
      process.stderr.write(`[error] ${file}: ${err instanceof Error ? err.message : err}\n`);
    });
  }
};

await loadState();
process.stdout.write(
  `[codexmux] syncing ${codexDir} -> ${serverUrl} (${sinceHours === null ? 'all sessions' : `last ${sinceHours}h`})\n`,
);

do {
  await scanOnce();
  if (once) break;
  await sleep(intervalMs);
} while (true);
