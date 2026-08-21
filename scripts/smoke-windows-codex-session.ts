import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildSyntheticCodexProcessArgs,
  buildWindowsCodexSessionJsonl,
  buildWindowsCodexSessionJsonlPath,
  createWindowsCodexSessionSmokeEnv,
} from './windows-codex-session-smoke-lib';

const DEFAULT_TIMEOUT_MS = Number(process.env.CODEXMUX_WINDOWS_CODEX_SESSION_SMOKE_TIMEOUT_MS || 20_000);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async <T>(
  label: string,
  predicate: () => Promise<T | null | false>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(`${label} timed out`);
};

const assignProcessEnv = (env: NodeJS.ProcessEnv): void => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const stopChild = async (child: ChildProcess | null): Promise<void> => {
  if (!child?.pid || child.killed) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
    setTimeout(resolve, 1000).unref();
  });
};

const main = async (): Promise<void> => {
  if (process.platform !== 'win32') {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'Windows Codex session detection smoke only runs on win32.',
    }, null, 2));
    return;
  }

  const homeDir = process.env.CODEXMUX_WINDOWS_CODEX_SESSION_SMOKE_HOME
    || await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-windows-codex-session-'));
  const cwd = process.cwd();
  const startedAt = new Date().toISOString();
  const sessionId = randomUUID();
  const jsonlPath = buildWindowsCodexSessionJsonlPath({ homeDir, sessionId, startedAt });
  let child: ChildProcess | null = null;
  const checks: string[] = [];

  try {
    assignProcessEnv(createWindowsCodexSessionSmokeEnv({
      env: process.env,
      homeDir,
    }));

    await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
    await fs.writeFile(jsonlPath, buildWindowsCodexSessionJsonl({ sessionId, cwd, startedAt }));
    checks.push('write-codex-jsonl');

    child = spawn(process.execPath, buildSyntheticCodexProcessArgs(sessionId), {
      cwd,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!child.pid) throw new Error('synthetic Codex process did not expose a pid');
    const childPid = child.pid;
    checks.push('spawn-codex-shaped-process');

    const { detectActiveCodexSession, findCodexSessionJsonl } = await import('@/lib/codex-session-detection');

    const mappedById = await findCodexSessionJsonl(sessionId, null);
    if (mappedById?.jsonlPath !== jsonlPath) {
      throw new Error(`session id JSONL mapping failed: ${JSON.stringify(mappedById)}`);
    }
    checks.push('session-id-jsonl-mapping');

    const mappedByCwd = await findCodexSessionJsonl(null, cwd, { allowCwdFallback: true });
    if (mappedByCwd?.jsonlPath !== jsonlPath) {
      throw new Error(`cwd JSONL fallback mapping failed: ${JSON.stringify(mappedByCwd)}`);
    }
    checks.push('cwd-jsonl-fallback-mapping');

    const active = await waitFor('active Codex session detection', async () => {
      const info = await detectActiveCodexSession(process.pid, [childPid]);
      return info.status === 'running' && info.sessionId === sessionId && info.jsonlPath === jsonlPath
        ? info
        : null;
    });
    if (typeof active.pid !== 'number') {
      throw new Error(`active Codex pid is missing: ${JSON.stringify(active)}`);
    }
    checks.push('detect-active-codex-session');

    console.log(JSON.stringify({
      ok: true,
      homeDir,
      sessionId,
      jsonlPath,
      childPid,
      detected: active,
      checks,
    }, null, 2));
  } finally {
    await stopChild(child);
    if (!process.env.CODEXMUX_WINDOWS_CODEX_SESSION_SMOKE_HOME) {
      await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
