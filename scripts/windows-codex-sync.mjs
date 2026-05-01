#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_FULL_SCAN_INTERVAL_MS = 60_000;
const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_OFFSET_RETRIES = 2;
const HOT_DAY_COUNT = 2;
const HOT_KNOWN_FILE_WINDOW_MS = 10 * 60 * 1000;
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

const printHelp = () => {
  process.stdout.write(`Usage: node scripts/windows-codex-sync.mjs [options]

Options:
  --server <url>                 codexmux server URL (CMUX_URL, CODEXMUX_URL)
  --token <value>                CLI token sent as x-cmux-token (CMUX_TOKEN, CODEXMUX_TOKEN)
  --token-file <path>            file containing the CLI token (CMUX_TOKEN_FILE, CODEXMUX_TOKEN_FILE)
  --source-id <id>               source id shown in codexmux (default: Windows hostname)
  --shell <name>                 shell label (default: pwsh)
  --codex-dir <path>             Codex sessions root (default: ~/.codex/sessions)
  --interval-ms <ms>             polling interval, >= 500 (default: ${DEFAULT_INTERVAL_MS})
  --full-scan-interval-ms <ms>   full tree scan interval (default: ${DEFAULT_FULL_SCAN_INTERVAL_MS})
  --since-hours <n|all|0>        scan range (default: all)
  --state-file <path>            local offset state path
  --dry-run                      scan and report pending uploads without sending chunks
  --no-health-check              skip GET /api/health before syncing
  --once                         scan once and exit
  --help                         show this help
`);
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

const readTokenFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw.trim();
  } catch (err) {
    if (readArg('token-file') || process.env.CMUX_TOKEN_FILE || process.env.CODEXMUX_TOKEN_FILE) {
      die(`Failed to read token file ${filePath}: ${err instanceof Error ? err.message : err}`);
    }
    return '';
  }
};

if (hasFlag('help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const serverUrl = normalizeServer(readArg('server') || process.env.CMUX_URL || process.env.CODEXMUX_URL);
const sourceId = readArg('source-id') || process.env.CMUX_SOURCE_ID || os.hostname();
const shellName = readArg('shell') || process.env.CMUX_SHELL || 'pwsh';
const codexDir = path.resolve(
  readArg('codex-dir')
  || process.env.CODEX_SESSIONS_DIR
  || path.join(os.homedir(), '.codex', 'sessions'),
);
const intervalMs = Number(readArg('interval-ms') || DEFAULT_INTERVAL_MS);
const fullScanIntervalMs = Number(
  readArg('full-scan-interval-ms')
  || process.env.CMUX_FULL_SCAN_INTERVAL_MS
  || DEFAULT_FULL_SCAN_INTERVAL_MS,
);
const sinceHours = parseSinceHours(readArg('since-hours') || process.env.CMUX_SINCE_HOURS);
const stateFile = path.resolve(
  readArg('state-file')
  || process.env.CMUX_SYNC_STATE
  || path.join(os.homedir(), '.codexmux', 'windows-codex-sync-state.json'),
);
const tokenFile = path.resolve(
  readArg('token-file')
  || process.env.CMUX_TOKEN_FILE
  || process.env.CODEXMUX_TOKEN_FILE
  || path.join(os.homedir(), '.codexmux', 'cli-token'),
);
const once = hasFlag('once');
const dryRun = hasFlag('dry-run');
const healthCheck = !hasFlag('no-health-check');
const token = readArg('token') || process.env.CMUX_TOKEN || process.env.CODEXMUX_TOKEN || await readTokenFile(tokenFile);

if (!serverUrl) die('Missing --server or CMUX_URL');
if (!token && !dryRun) die('Missing --token, --token-file, CMUX_TOKEN, or CMUX_TOKEN_FILE');
if (!Number.isFinite(intervalMs) || intervalMs < 500) die('--interval-ms must be >= 500');
if (!Number.isFinite(fullScanIntervalMs) || fullScanIntervalMs < intervalMs) {
  die('--full-scan-interval-ms must be >= --interval-ms');
}
if (Number.isNaN(sinceHours)) die('--since-hours must be a positive number, 0, or all');

const state = new Map();
let lastFullScanAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
};

const checkServerHealth = async () => {
  if (!healthCheck) return;
  const response = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`health check failed ${response.status}`);
  }
  const body = await response.json().catch(() => ({}));
  const version = body.version ? ` v${body.version}` : '';
  const commit = body.commit ? ` (${body.commit})` : '';
  process.stdout.write(`[codexmux] server ready${version}${commit}\n`);
};

const createScanStats = (scanType, filesSeen) => ({
  scanType,
  filesSeen,
  candidates: 0,
  unchanged: 0,
  syncedFiles: 0,
  dryRunFiles: 0,
  chunks: 0,
  bytes: 0,
  retries: 0,
  skippedNoSessionId: 0,
  errors: 0,
});

const addStats = (target, source) => {
  for (const key of ['unchanged', 'syncedFiles', 'dryRunFiles', 'chunks', 'bytes', 'retries', 'skippedNoSessionId', 'errors']) {
    target[key] += source[key] || 0;
  }
};

const printScanSummary = (stats) => {
  const changed = stats.syncedFiles + stats.dryRunFiles + stats.retries + stats.skippedNoSessionId + stats.errors;
  if (!once && stats.scanType !== 'full' && changed === 0) return;

  process.stdout.write(
    `[scan] ${stats.scanType} files=${stats.filesSeen} candidates=${stats.candidates}`
    + ` synced=${stats.syncedFiles} dryRun=${stats.dryRunFiles} unchanged=${stats.unchanged}`
    + ` chunks=${stats.chunks} bytes=${formatBytes(stats.bytes)} retries=${stats.retries}`
    + ` noSessionId=${stats.skippedNoSessionId} errors=${stats.errors}\n`,
  );
};

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
        size: Number.isFinite(entry.size) && entry.size >= 0 ? entry.size : entry.offset,
        mtimeMs: Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= 0 ? entry.mtimeMs : 0,
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

const formatDateDir = (timeMs) => {
  const d = new Date(timeMs);
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return path.join(codexDir, year, month, day);
};

const collectHotJsonlFiles = async () => {
  const files = new Set();
  const now = Date.now();

  for (const [filePath, entry] of state.entries()) {
    if (entry.mtimeMs && now - entry.mtimeMs <= HOT_KNOWN_FILE_WINDOW_MS) {
      files.add(filePath);
    }
  }

  for (let i = 0; i < HOT_DAY_COUNT; i++) {
    const dir = formatDateDir(now - i * 24 * 60 * 60 * 1000);
    for (const file of await collectJsonlFiles(dir)) {
      files.add(file);
    }
  }

  return [...files];
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

const syncFile = async (filePath, stat, retryCount = 0) => {
  const prev = state.get(filePath);
  const reset = !prev || stat.size < prev.offset;
  const startOffset = reset ? 0 : prev.offset;
  if (!reset && stat.size === startOffset) return { unchanged: 1 };

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
      return { skippedNoSessionId: 1 };
    }
    const meta = reset ? extractCwdAndStartedAt(firstChunk) : (prev?.meta || { cwd: null, startedAt: null });

    if (dryRun) {
      const pendingBytes = stat.size - startOffset;
      const pendingChunks = Math.ceil(pendingBytes / MAX_CHUNK_BYTES);
      process.stdout.write(`[dry-run] ${sessionId} ${formatBytes(pendingBytes)} ${filePath}\n`);
      return { dryRunFiles: 1, bytes: pendingBytes, chunks: pendingChunks };
    }

    let offset = startOffset;
    let bytes = 0;
    let chunks = 0;
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
        if (retryCount >= MAX_OFFSET_RETRIES) {
          throw new Error(`offset mismatch retry limit exceeded; server expected ${result.expectedOffset}`);
        }
        state.delete(filePath);
        await saveState();
        process.stderr.write(`[retry] offset mismatch for ${filePath}; server expected ${result.expectedOffset}\n`);
        const retryStats = await syncFile(filePath, stat, retryCount + 1);
        return { ...retryStats, retries: (retryStats?.retries || 0) + 1 };
      }
      offset += size;
      bytes += size;
      chunks++;
    }

    state.set(filePath, { offset: stat.size, size: stat.size, mtimeMs: stat.mtimeMs, sessionId, meta });
    await saveState();
    process.stdout.write(`[synced] ${sessionId} ${stat.size} bytes ${filePath}\n`);
    return { syncedFiles: 1, bytes, chunks };
  } finally {
    await handle.close();
  }
};

const scanOnce = async () => {
  const cutoff = sinceHours === null ? 0 : Date.now() - sinceHours * 60 * 60 * 1000;
  const now = Date.now();
  const shouldFullScan = lastFullScanAt === 0 || now - lastFullScanAt >= fullScanIntervalMs;
  const files = shouldFullScan ? await collectJsonlFiles(codexDir) : await collectHotJsonlFiles();
  if (shouldFullScan) lastFullScanAt = now;
  const stats = createScanStats(shouldFullScan ? 'full' : 'hot', files.length);
  const candidates = [];
  for (const file of files) {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.mtimeMs < cutoff) continue;
    candidates.push({ file, stat });
  }
  candidates.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  stats.candidates = candidates.length;

  for (const { file, stat } of candidates) {
    await syncFile(file, stat).then((fileStats) => {
      if (fileStats) addStats(stats, fileStats);
    }).catch((err) => {
      stats.errors++;
      process.stderr.write(`[error] ${file}: ${err instanceof Error ? err.message : err}\n`);
    });
  }
  printScanSummary(stats);
};

await loadState();
await checkServerHealth().catch((err) => {
  die(`[error] ${err instanceof Error ? err.message : err}`);
});
process.stdout.write(
  `[codexmux] syncing ${codexDir} -> ${serverUrl} (${sinceHours === null ? 'all sessions' : `last ${sinceHours}h`}, full scan ${fullScanIntervalMs}ms${dryRun ? ', dry run' : ''})\n`,
);

do {
  await scanOnce();
  if (once) break;
  await sleep(intervalMs);
} while (true);
