#!/usr/bin/env node
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import {
  buildWindowsCodexSessionJsonl,
  buildWindowsSyncArgs,
  validateWindowsSyncSmokeResult,
} from './windows-sync-smoke-lib.mjs';

const DEFAULT_TIMEOUT_MS = 30_000;
const rootDir = process.cwd();
const SESSION_ID = '019df010-3a02-73a0-a79e-8703b99a2f30';
const SOURCE_ID = 'win11-smoke';
const WINDOWS_CWD = 'C:\\Users\\codex\\project';
const FIRST_MESSAGE = 'Windows smoke prompt';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (code, message, details = {}) => {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(1);
};

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });

const waitFor = async (label, fn, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`${label} timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
};

const startServer = async ({ homeDir, port }) => {
  const env = {
    ...process.env,
    HOME: homeDir,
    SHELL: '/bin/sh',
    PORT: String(port),
  };
  delete env.__CMUX_PRISTINE_ENV;
  env.__CMUX_PRISTINE_ENV = JSON.stringify(env);

  const child = spawn('corepack', ['pnpm', 'exec', 'tsx', 'server.ts'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitFor('Windows sync smoke server startup', async () => {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}: ${output.slice(-1200)}`);
    const res = await fetch(new URL('/api/health', baseUrl)).catch(() => null);
    return res?.ok;
  });

  return {
    baseUrl,
    getOutput: () => output,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGINT');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        sleep(10_000).then(() => {
          child.kill('SIGTERM');
          return new Promise((resolve) => child.once('exit', resolve));
        }),
      ]);
    },
  };
};

const runNode = async (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`node ${args.join(' ')} failed with ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });

const jsonRequest = async (baseUrl, pathname, token) => {
  const res = await fetch(new URL(pathname, baseUrl), {
    headers: { 'x-cmux-token': token },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`GET ${pathname} failed: ${res.status} ${text}`);
  return data;
};

const writeFixture = async (codexDir) => {
  const dayDir = path.join(codexDir, '2026', '05', '04');
  await fs.mkdir(dayDir, { recursive: true });
  const filePath = path.join(dayDir, `rollout-2026-05-04T01-00-00-${SESSION_ID}.jsonl`);
  await fs.writeFile(filePath, buildWindowsCodexSessionJsonl({
    sessionId: SESSION_ID,
    cwd: WINDOWS_CWD,
    message: FIRST_MESSAGE,
    startedAt: '2026-05-04T01:00:00.000Z',
  }));
  const mtime = new Date('2026-05-04T01:00:02.000Z');
  await fs.utimes(filePath, mtime, mtime);
  return filePath;
};

const readStateOffset = async (stateFile, filePath) => {
  const state = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
  return state?.files?.[filePath]?.offset ?? null;
};

const main = async () => {
  const homeDir = process.env.CODEXMUX_WINDOWS_SYNC_SMOKE_HOME
    || await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-windows-sync-smoke-'));
  const port = Number(process.env.CODEXMUX_WINDOWS_SYNC_SMOKE_PORT || await getFreePort());
  const checks = [];
  let server = null;

  try {
    const codexDir = path.join(homeDir, 'windows-user', '.codex', 'sessions');
    const stateFile = path.join(homeDir, 'windows-user', '.codexmux', 'windows-codex-sync-state.json');
    const fixturePath = await writeFixture(codexDir);
    const fixtureSize = (await fs.stat(fixturePath)).size;
    checks.push('fixture');

    server = await startServer({ homeDir, port });
    const tokenFile = path.join(homeDir, '.codexmux', 'cli-token');
    const token = (await fs.readFile(tokenFile, 'utf-8')).trim();
    checks.push('server');

    const scriptPath = path.join(rootDir, 'scripts', 'windows-codex-sync.mjs');
    const commonArgs = {
      scriptPath,
      serverUrl: server.baseUrl,
      tokenFile,
      sourceId: SOURCE_ID,
      shellName: 'pwsh',
      codexDir,
      stateFile,
    };

    const dryRun = await runNode(buildWindowsSyncArgs({ ...commonArgs, dryRun: true }), { HOME: homeDir });
    if (!dryRun.stdout.includes('[dry-run]') || !dryRun.stdout.includes(SESSION_ID)) {
      throw new Error(`dry-run did not report pending session ${SESSION_ID}: ${dryRun.stdout}${dryRun.stderr}`);
    }
    checks.push('dry-run');

    const firstSync = await runNode(buildWindowsSyncArgs(commonArgs), { HOME: homeDir });
    if (!firstSync.stdout.includes('[synced]') || !firstSync.stdout.includes(SESSION_ID)) {
      throw new Error(`sync did not upload session ${SESSION_ID}: ${firstSync.stdout}${firstSync.stderr}`);
    }
    const offset = await readStateOffset(stateFile, fixturePath);
    if (offset !== fixtureSize) throw new Error(`state offset mismatch: ${offset} !== ${fixtureSize}`);
    checks.push('sync-upload');
    checks.push('state-offset');

    const secondSync = await runNode(buildWindowsSyncArgs(commonArgs), { HOME: homeDir });
    if (!secondSync.stdout.includes('unchanged=1')) {
      throw new Error(`second sync did not use local offset state: ${secondSync.stdout}${secondSync.stderr}`);
    }
    checks.push('offset-resume');

    const sourcesData = await waitFor('remote source summary', async () => {
      const data = await jsonRequest(server.baseUrl, '/api/remote/codex/sources', token);
      return data.sources?.some((source) => source.sourceId === SOURCE_ID) ? data : null;
    });
    const page = await waitFor('remote session page', async () => {
      const data = await jsonRequest(
        server.baseUrl,
        `/api/timeline/sessions?tmuxSession=windows-smoke&panelType=codex&source=remote&sourceId=${encodeURIComponent(SOURCE_ID)}&limit=10`,
        token,
      );
      return data.sessions?.some((session) => session.sessionId === SESSION_ID) ? data : null;
    });
    checks.push(...validateWindowsSyncSmokeResult({
      expected: {
        sourceId: SOURCE_ID,
        sessionId: SESSION_ID,
        message: FIRST_MESSAGE,
        cwd: WINDOWS_CWD,
      },
      sources: sourcesData.sources,
      page,
    }));

    console.log(JSON.stringify({
      ok: true,
      baseUrl: server.baseUrl,
      checks,
      fixture: {
        path: fixturePath,
        bytes: fixtureSize,
      },
      source: sourcesData.sources.find((source) => source.sourceId === SOURCE_ID),
      session: page.sessions.find((session) => session.sessionId === SESSION_ID),
    }, null, 2));
  } catch (err) {
    fail('windows-sync-smoke-failed', err instanceof Error ? err.message : String(err), {
      checks,
      serverOutput: server?.getOutput?.().slice(-2000) ?? '',
    });
  } finally {
    await server?.stop?.();
  }
};

main();
