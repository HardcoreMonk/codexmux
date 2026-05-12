#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { sleep } from './android-webview-smoke-lib.mjs';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  buildNsisSilentInstallArgs,
  buildNsisSilentUninstallArgs,
  findWindowsInstaller,
  getWindowsInstallerVersion,
  resolveInstalledAppPaths,
} from './windows-installer-smoke-lib.mjs';

const rootDir = process.cwd();
const releaseDir = path.resolve(process.env.CODEXMUX_WINDOWS_RELEASE_DIR || path.join(rootDir, 'release'));
const startedAt = new Date().toISOString();
const SMOKE_NAME = 'windows-installed-observation';

const runCommand = (command, args, { env = process.env, cwd = rootDir, timeoutMs = 300_000 } = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, signal: null, stdout, stderr: `${stderr}${err.message}`, timedOut });
    });
    child.on('exit', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
  });

const parseJsonPayload = (stdout) => {
  const text = String(stdout || '').trim();
  const start = text.indexOf('{');
  if (start < 0) return null;
  return JSON.parse(text.slice(start));
};

const summarizeRound = (round, result) => {
  const payload = result.exitCode === 0 && !result.timedOut ? parseJsonPayload(result.stdout) : null;
  return {
    round,
    ok: result.exitCode === 0 && !result.timedOut && payload?.ok === true,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    version: payload?.health?.version ?? null,
    commit: payload?.health?.commit ?? null,
    checks: payload?.checks ?? [],
    phase6: payload?.runtimeV2Phase6?.ok === true,
    stderrTail: result.stderr ? result.stderr.slice(-800) : '',
    stdoutTail: result.stdout ? result.stdout.slice(-800) : '',
  };
};

const writeArtifact = async (status, payload) =>
  writeSmokeArtifact({
    smokeName: SMOKE_NAME,
    status,
    startedAt,
    payload,
  }).catch(() => null);

const fail = async (code, message, details = {}) => {
  const payload = { ok: false, code, message, mutatesSystem: true, ...details };
  await writeArtifact('failed', payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
};

const main = async () => {
  if (process.platform !== 'win32') {
    await fail('windows-installed-observation-platform-mismatch', 'Windows installed observation smoke requires win32.', {
      platform: process.platform,
    });
  }

  const installerPath = path.resolve(
    process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_INSTALLER_PATH || findWindowsInstaller(releaseDir) || '',
  );
  const version = getWindowsInstallerVersion(installerPath);
  if (!version) {
    await fail('windows-installed-observation-installer-missing', 'A versioned Windows installer is required.', {
      installerPath,
    });
  }

  const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-installed-observation-'));
  const installDir = path.join(smokeRoot, 'app');
  const homeDir = path.join(smokeRoot, 'home');
  const paths = resolveInstalledAppPaths(installDir);
  const durationMs = Number(process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_DURATION_MS || 600_000);
  const intervalMs = Number(process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_ROUND_INTERVAL_MS || 5_000);
  const maxRounds = Number(process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_MAX_ROUNDS || 50);
  const checks = [];
  const rounds = [];
  let uninstallResult = null;

  try {
    await fs.mkdir(homeDir, { recursive: true });
    const installResult = await runCommand(installerPath, buildNsisSilentInstallArgs(installDir), {
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_INSTALL_TIMEOUT_MS || 300_000),
    });
    if (installResult.exitCode !== 0 || installResult.timedOut) {
      throw new Error(`silent install failed: ${JSON.stringify({
        exitCode: installResult.exitCode,
        timedOut: installResult.timedOut,
        stderr: installResult.stderr.slice(-1200),
        stdout: installResult.stdout.slice(-1200),
      })}`);
    }
    checks.push('silent-install');
    await fs.access(paths.appExe);
    checks.push('installed-exe-present');

    const started = Date.now();
    let round = 0;
    while (Date.now() - started < durationMs && round < maxRounds) {
      round += 1;
      const result = await runCommand(process.execPath, ['scripts/smoke-windows-packaged-launch.mjs', '--runtime-v2-terminal'], {
        env: {
          ...process.env,
          CODEXMUX_WINDOWS_PACKAGED_APP_PATH: paths.appExe,
          CODEXMUX_WINDOWS_PACKAGED_LAUNCH_HOME: homeDir,
        },
        timeoutMs: Number(process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_ROUND_TIMEOUT_MS || 180_000),
      });
      const summary = summarizeRound(round, result);
      rounds.push(summary);
      if (!summary.ok || summary.version !== version || summary.phase6 !== true) {
        throw new Error(`observation round ${round} failed: ${JSON.stringify(summary)}`);
      }
      checks.push(`observation-round-${round}`);
      if (Date.now() - started < durationMs) await sleep(intervalMs);
    }

    const observedMs = Date.now() - started;
    if (rounds.length === 0) throw new Error('observation did not run any rounds');
    checks.push('observation-duration');

    uninstallResult = await runCommand(paths.uninstaller, buildNsisSilentUninstallArgs(), {
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_INSTALLED_OBSERVATION_UNINSTALL_TIMEOUT_MS || 300_000),
    });
    if (uninstallResult.exitCode !== 0 || uninstallResult.timedOut) {
      throw new Error(`silent uninstall failed: ${JSON.stringify({
        exitCode: uninstallResult.exitCode,
        timedOut: uninstallResult.timedOut,
        stderr: uninstallResult.stderr.slice(-1200),
      })}`);
    }
    checks.push('silent-uninstall');

    const payload = {
      ok: true,
      mutatesSystem: true,
      installerVersion: version,
      durationMs,
      observedMs,
      roundCount: rounds.length,
      checks,
      rounds,
    };
    await writeArtifact('passed', payload);
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    if (!uninstallResult) {
      await runCommand(paths.uninstaller, buildNsisSilentUninstallArgs(), { timeoutMs: 120_000 }).catch(() => null);
    }
    await fail('windows-installed-observation-failed', err instanceof Error ? err.message : String(err), {
      installerVersion: version,
      checks,
      rounds,
    });
  } finally {
    await fs.rm(smokeRoot, { recursive: true, force: true }).catch(() => null);
  }
};

main();
