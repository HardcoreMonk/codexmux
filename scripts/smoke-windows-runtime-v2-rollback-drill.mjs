#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
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
const SMOKE_NAME = 'windows-runtime-v2-rollback-drill';

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

const runPackagedLaunch = async ({ appExe, homeDir, mode }) => {
  const env = {
    ...process.env,
    CODEXMUX_WINDOWS_PACKAGED_APP_PATH: appExe,
    CODEXMUX_WINDOWS_PACKAGED_LAUNCH_HOME: path.join(homeDir, mode),
  };
  const args = ['scripts/smoke-windows-packaged-launch.mjs'];
  if (mode === 'runtime-v2-on' || mode === 'runtime-v2-restored') {
    args.push('--runtime-v2-terminal');
  } else {
    env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_V2 = '0';
    env.CODEXMUX_WINDOWS_PACKAGED_EXPECT_RUNTIME_V2_DISABLED = '1';
  }

  const result = await runCommand(process.execPath, args, {
    env,
    timeoutMs: Number(process.env.CODEXMUX_WINDOWS_ROLLBACK_DRILL_LAUNCH_TIMEOUT_MS || 180_000),
  });
  const payload = result.exitCode === 0 && !result.timedOut ? parseJsonPayload(result.stdout) : null;
  return {
    mode,
    ok: result.exitCode === 0 && !result.timedOut && payload?.ok === true,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    version: payload?.health?.version ?? null,
    commit: payload?.health?.commit ?? null,
    phase6: payload?.runtimeV2Phase6?.ok === true,
    disabled: payload?.runtimeV2Disabled?.ok === true,
    checks: payload?.checks ?? [],
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
    await fail('windows-runtime-v2-rollback-drill-platform-mismatch', 'Windows rollback drill requires win32.', {
      platform: process.platform,
    });
  }

  const installerPath = path.resolve(
    process.env.CODEXMUX_WINDOWS_ROLLBACK_DRILL_INSTALLER_PATH || findWindowsInstaller(releaseDir) || '',
  );
  const version = getWindowsInstallerVersion(installerPath);
  if (!version) {
    await fail('windows-runtime-v2-rollback-drill-installer-missing', 'A versioned Windows installer is required.', {
      installerPath,
    });
  }

  const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-runtime-rollback-'));
  const installDir = path.join(smokeRoot, 'app');
  const homeDir = path.join(smokeRoot, 'home');
  const paths = resolveInstalledAppPaths(installDir);
  const checks = [];
  const phases = [];
  let uninstallResult = null;

  try {
    const installResult = await runCommand(installerPath, buildNsisSilentInstallArgs(installDir), {
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_ROLLBACK_DRILL_INSTALL_TIMEOUT_MS || 300_000),
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

    phases.push(await runPackagedLaunch({ appExe: paths.appExe, homeDir, mode: 'runtime-v2-on' }));
    phases.push(await runPackagedLaunch({ appExe: paths.appExe, homeDir, mode: 'runtime-v2-rollback-off' }));
    phases.push(await runPackagedLaunch({ appExe: paths.appExe, homeDir, mode: 'runtime-v2-restored' }));

    for (const phase of phases) {
      if (!phase.ok || phase.version !== version) {
        throw new Error(`rollback drill phase failed: ${JSON.stringify(phase)}`);
      }
      if (phase.mode === 'runtime-v2-rollback-off') {
        if (!phase.disabled) throw new Error(`rollback disabled phase did not prove runtime v2 disabled: ${JSON.stringify(phase)}`);
      } else if (!phase.phase6) {
        throw new Error(`runtime v2 phase did not prove Phase 6 gate: ${JSON.stringify(phase)}`);
      }
      checks.push(phase.mode);
    }

    uninstallResult = await runCommand(paths.uninstaller, buildNsisSilentUninstallArgs(), {
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_ROLLBACK_DRILL_UNINSTALL_TIMEOUT_MS || 300_000),
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
      checks,
      phases,
    };
    await writeArtifact('passed', payload);
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    if (!uninstallResult) {
      await runCommand(paths.uninstaller, buildNsisSilentUninstallArgs(), { timeoutMs: 120_000 }).catch(() => null);
    }
    await fail('windows-runtime-v2-rollback-drill-failed', err instanceof Error ? err.message : String(err), {
      installerVersion: version,
      checks,
      phases,
    });
  } finally {
    await fs.rm(smokeRoot, { recursive: true, force: true }).catch(() => null);
  }
};

main();
