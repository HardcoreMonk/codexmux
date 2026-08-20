import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';
import { STATUSLINE_SCRIPT_PATH, STATUSLINE_SCRIPT_CONTENT } from '@/lib/statusline-script';
import { CODEXMUX_STATUS_HOOK_BRIDGE_PATH } from '@/lib/providers/codex/session-hooks';

const log = createLogger('hooks');

const BASE_DIR = path.join(os.homedir(), '.codexmux');
const HOOKS_FILE = path.join(BASE_DIR, 'hooks.json');
const PORT_FILE = path.join(BASE_DIR, 'port');
const HOOK_BRIDGE = CODEXMUX_STATUS_HOOK_BRIDGE_PATH;

export const HOOK_SETTINGS_PATH = HOOKS_FILE;

const HOOK_BRIDGE_CONTENT = `'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const MAX_STDIN_BYTES = 64 * 1024;
const baseDir = path.join(os.homedir(), '.codexmux');
const event = typeof process.argv[2] === 'string' ? process.argv[2] : 'poll';
const session = typeof process.argv[3] === 'string' ? process.argv[3] : '';
const capability = typeof process.argv[4] === 'string' ? process.argv[4] : '';
let received = 0;
let chunks = [];

process.stdin.on('data', (chunk) => {
  if (received >= MAX_STDIN_BYTES) return;
  const buffer = Buffer.from(chunk);
  const remaining = MAX_STDIN_BYTES - received;
  chunks.push(buffer.subarray(0, remaining));
  received += Math.min(buffer.byteLength, remaining);
});

process.stdin.on('end', () => {
  try {
    const port = Number.parseInt(fs.readFileSync(path.join(baseDir, 'port'), 'utf8').trim(), 10);
    const token = fs.readFileSync(path.join(baseDir, 'cli-token'), 'utf8').trim();
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) process.exit(0);
    const body = JSON.stringify({ event, session, capability });
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/status/hook',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-cmux-token': token,
      },
    }, (response) => {
      response.resume();
      response.on('end', () => process.exit(0));
    });
    request.setTimeout(1000, () => request.destroy());
    request.on('error', () => process.exit(0));
    request.end(body);
  } catch {
    process.exit(0);
  }
});

process.stdin.resume();
setTimeout(() => process.exit(0), 1500).unref();
`;

export const getStatusHookBridgeSource = (): string => HOOK_BRIDGE_CONTENT;

export const buildHookSettings = () => ({
  hooks: {},
  statusLine: {
    type: 'command' as const,
    command: `sh "${STATUSLINE_SCRIPT_PATH}"`,
  },
});

const writeIfChanged = async (filePath: string, content: string, mode: number): Promise<void> => {
  try {
    if (await fs.readFile(filePath, 'utf-8') === content) return;
  } catch {
    // Create the file below.
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, content, { mode });
  await fs.rename(temporaryPath, filePath);
  await fs.chmod(filePath, mode);
};

export const ensureHookSettings = async (port: number): Promise<void> => {
  await fs.mkdir(BASE_DIR, { recursive: true });

  await fs.writeFile(PORT_FILE, String(port), { mode: 0o600 });

  await writeIfChanged(HOOK_BRIDGE, getStatusHookBridgeSource(), 0o700);

  // Create statusline script
  try {
    const existing = await fs.readFile(STATUSLINE_SCRIPT_PATH, 'utf-8');
    if (existing !== STATUSLINE_SCRIPT_CONTENT) {
      await fs.writeFile(STATUSLINE_SCRIPT_PATH, STATUSLINE_SCRIPT_CONTENT, { mode: 0o755 });
    }
  } catch {
    await fs.writeFile(STATUSLINE_SCRIPT_PATH, STATUSLINE_SCRIPT_CONTENT, { mode: 0o755 });
  }

  // Create hooks.json
  const settings = buildHookSettings();
  const content = JSON.stringify(settings, null, 2) + '\n';

  try {
    const existing = await fs.readFile(HOOKS_FILE, 'utf-8');
    if (existing === content) return;
  } catch {
    // file doesn't exist yet
  }

  await fs.writeFile(HOOKS_FILE, content, { mode: 0o600 });
  log.debug(`${HOOKS_FILE} created`);
};

export const removePortFile = async (): Promise<void> => {
  try {
    await fs.unlink(PORT_FILE);
  } catch {
    // already removed
  }
};
