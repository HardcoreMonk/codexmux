#!/usr/bin/env node

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_OUTPUT_FLUSH_MS = 40;
const MAX_OUTPUT_CHUNK_BYTES = 256 * 1024;

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
  process.stdout.write(`Usage: node scripts/windows-terminal-bridge.mjs [options]

Options:
  --server <url>               codexmux server URL (CMUX_URL, CODEXMUX_URL)
  --token <value>              CLI token sent as x-cmux-token (CMUX_TOKEN, CODEXMUX_TOKEN)
  --token-file <path>          file containing the CLI token
  --source-id <id>             source id shown in codexmux (default: Windows hostname)
  --terminal-id <id>           terminal id within the source (default: main)
  --shell <name>               shell label (default: pwsh)
  --shell-path <path>          executable to run (default: pwsh.exe on Windows, $SHELL elsewhere)
  --cwd <path>                 working directory (default: current directory)
  --cols <n>                   initial columns (default: 120)
  --rows <n>                   initial rows (default: 36)
  --poll-interval-ms <ms>      command polling interval, >= 100 (default: ${DEFAULT_POLL_INTERVAL_MS})
  --output-flush-ms <ms>       stdout post batching interval, >= 10 (default: ${DEFAULT_OUTPUT_FLUSH_MS})
  --help                       show this help
`);
};

const normalizeServer = (value) => {
  if (!value) return '';
  const raw = String(value).trim().replace(/\/+$/, '');
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const readTokenFile = async (filePath) => {
  try {
    return (await fs.readFile(filePath, 'utf-8')).trim();
  } catch (err) {
    if (readArg('token-file') || process.env.CMUX_TOKEN_FILE || process.env.CODEXMUX_TOKEN_FILE) {
      die(`Failed to read token file ${filePath}: ${err instanceof Error ? err.message : err}`);
    }
    return '';
  }
};

const parseIntOption = (name, fallback, min, max) => {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min) die(`--${name} must be >= ${min}`);
  return Math.min(Math.floor(parsed), max);
};

const resolveDefaultShellPath = (shellName) => {
  if (process.platform !== 'win32') return process.env.SHELL || 'sh';
  const normalized = shellName.toLowerCase();
  if (normalized === 'cmd') return 'cmd.exe';
  if (normalized === 'powershell') return 'powershell.exe';
  return 'pwsh.exe';
};

const loadNodePty = async () => {
  try {
    const mod = await import('node-pty');
    return mod.default ?? mod;
  } catch {
    return null;
  }
};

const requestJson = async ({ serverUrl, token, pathname, method = 'GET', body }) => {
  const res = await fetch(new URL(pathname, serverUrl), {
    method,
    headers: {
      'x-cmux-token': token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${pathname} failed ${res.status}: ${text}`);
  }
  return data;
};

const createTerminal = async ({ shellPath, cwd, cols, rows, env }) => {
  const pty = await loadNodePty();
  if (pty?.spawn) {
    const term = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });
    return {
      kind: 'node-pty',
      write: (data) => term.write(data),
      resize: (nextCols, nextRows) => term.resize(nextCols, nextRows),
      kill: () => term.kill(),
      onData: (cb) => term.onData(cb),
      onExit: (cb) => term.onExit(cb),
    };
  }

  const child = spawn(shellPath, [], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    kind: 'child-process',
    write: (data) => child.stdin.write(data),
    resize: () => undefined,
    kill: () => child.kill(),
    onData: (cb) => {
      child.stdout.on('data', (chunk) => cb(chunk.toString()));
      child.stderr.on('data', (chunk) => cb(chunk.toString()));
      return { dispose: () => undefined };
    },
    onExit: (cb) => {
      child.on('exit', (exitCode, signal) => cb({ exitCode, signal }));
      return { dispose: () => undefined };
    },
  };
};

if (hasFlag('help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const serverUrl = normalizeServer(readArg('server') || process.env.CMUX_URL || process.env.CODEXMUX_URL);
const sourceId = readArg('source-id') || process.env.CMUX_SOURCE_ID || os.hostname();
const terminalId = readArg('terminal-id') || process.env.CMUX_TERMINAL_ID || 'main';
const shellName = readArg('shell') || process.env.CMUX_SHELL || 'pwsh';
const shellPath = readArg('shell-path') || process.env.CMUX_SHELL_PATH || resolveDefaultShellPath(shellName);
const cwd = path.resolve(readArg('cwd') || process.env.CMUX_CWD || process.cwd());
const cols = parseIntOption('cols', 120, 1, 500);
const rows = parseIntOption('rows', 36, 1, 200);
const pollIntervalMs = parseIntOption('poll-interval-ms', DEFAULT_POLL_INTERVAL_MS, 100, 60_000);
const outputFlushMs = parseIntOption('output-flush-ms', DEFAULT_OUTPUT_FLUSH_MS, 10, 5_000);
const tokenFile = path.resolve(
  readArg('token-file')
  || process.env.CMUX_TOKEN_FILE
  || process.env.CODEXMUX_TOKEN_FILE
  || path.join(os.homedir(), '.codexmux', 'cli-token'),
);
const token = readArg('token') || process.env.CMUX_TOKEN || process.env.CODEXMUX_TOKEN || await readTokenFile(tokenFile);

if (!serverUrl) die('Missing --server or CMUX_URL');
if (!token) die('Missing --token, --token-file, CMUX_TOKEN, or CMUX_TOKEN_FILE');

let stopped = false;
let commandSeq = 0;
let flushTimer = null;
let pendingOutput = Buffer.alloc(0);
let terminal = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const metadata = () => ({
  sourceId,
  terminalId,
  host: os.hostname(),
  shell: shellName,
  cwd,
  cols,
  rows,
});

const register = async () => {
  await requestJson({
    serverUrl,
    token,
    pathname: '/api/remote/terminal/register',
    method: 'POST',
    body: metadata(),
  });
};

const postOutput = async (data) => {
  if (data.length === 0) return;
  await requestJson({
    serverUrl,
    token,
    pathname: '/api/remote/terminal/output',
    method: 'POST',
    body: {
      ...metadata(),
      dataBase64: data.toString('base64'),
    },
  });
};

const flushOutput = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingOutput.length === 0) return;
  const next = pendingOutput;
  pendingOutput = Buffer.alloc(0);
  try {
    await postOutput(next);
  } catch (err) {
    process.stderr.write(`[warn] output post failed: ${err instanceof Error ? err.message : err}\n`);
    pendingOutput = Buffer.concat([next, pendingOutput]).subarray(0, MAX_OUTPUT_CHUNK_BYTES);
  }
};

const queueOutput = (data) => {
  const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf-8');
  pendingOutput = Buffer.concat([pendingOutput, chunk]);
  if (pendingOutput.length >= MAX_OUTPUT_CHUNK_BYTES) {
    void flushOutput();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => void flushOutput(), outputFlushMs);
  }
};

const pollCommands = async () => {
  const params = new URLSearchParams({
    sourceId,
    terminalId,
    afterSeq: String(commandSeq),
    max: '100',
  });
  const data = await requestJson({
    serverUrl,
    token,
    pathname: `/api/remote/terminal/commands?${params.toString()}`,
  });
  for (const command of data.commands ?? []) {
    commandSeq = Math.max(commandSeq, command.seq || 0);
    if (command.type === 'stdin' && typeof command.data === 'string') {
      terminal.write(command.data);
    } else if (command.type === 'resize' && command.cols > 0 && command.rows > 0) {
      terminal.resize(command.cols, command.rows);
    } else if (command.type === 'kill') {
      stopped = true;
      terminal.kill();
    }
  }
};

const main = async () => {
  const health = await fetch(new URL('/api/health', serverUrl), { signal: AbortSignal.timeout(8_000) });
  if (!health.ok) throw new Error(`health check failed ${health.status}`);
  const healthData = await health.json().catch(() => ({}));
  const version = healthData.version ? ` v${healthData.version}` : '';
  const commit = healthData.commit ? ` (${healthData.commit})` : '';
  process.stdout.write(`[codexmux] server ready${version}${commit}\n`);

  terminal = await createTerminal({
    shellPath,
    cwd,
    cols,
    rows,
    env: process.env,
  });
  process.stdout.write(`[codexmux] started ${terminal.kind} ${shellPath} source=${sourceId} terminal=${terminalId}\n`);
  terminal.onData((data) => queueOutput(data));
  terminal.onExit(({ exitCode, signal }) => {
    stopped = true;
    queueOutput(`\r\n[codexmux] Windows terminal bridge exited code=${exitCode ?? ''} signal=${signal ?? ''}\r\n`);
  });

  await register();
  queueOutput(`[codexmux] Windows terminal bridge connected: ${sourceId}/${terminalId}\r\n`);

  let lastRegisterAt = Date.now();
  while (!stopped) {
    try {
      await pollCommands();
      if (Date.now() - lastRegisterAt > 30_000) {
        await register();
        lastRegisterAt = Date.now();
      }
    } catch (err) {
      process.stderr.write(`[warn] command poll failed: ${err instanceof Error ? err.message : err}\n`);
      await sleep(Math.min(5000, pollIntervalMs * 4));
    }
    await sleep(pollIntervalMs);
  }

  await flushOutput();
};

process.on('SIGINT', () => {
  stopped = true;
  terminal?.kill?.();
});
process.on('SIGTERM', () => {
  stopped = true;
  terminal?.kill?.();
});

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack || err.message : err}\n`);
  process.exit(1);
});
