#!/usr/bin/env node

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import {
  DEFAULT_OUTPUT_FLUSH_MS,
  DEFAULT_POLL_INTERVAL_MS,
  runWindowsTerminalBridge,
} from './windows-terminal-bridge-lib.mjs';

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

const stopState = { stopped: false, terminal: null };
const main = async () => {
  await runWindowsTerminalBridge({
    serverUrl,
    token,
    sourceId,
    terminalId,
    shellName,
    shellPath,
    cwd,
    cols,
    rows,
    pollIntervalMs,
    outputFlushMs,
    env: process.env,
    createTerminal,
    stopState,
  });
};

process.on('SIGINT', () => {
  stopState.stopped = true;
  stopState.terminal?.kill?.();
});
process.on('SIGTERM', () => {
  stopState.stopped = true;
  stopState.terminal?.kill?.();
});

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack || err.message : err}\n`);
  process.exit(1);
});
