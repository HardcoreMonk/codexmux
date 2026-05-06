#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import {
  buildNsisSilentInstallArgs,
  findWindowsInstaller,
  resolveInstalledAppPaths,
} from './windows-installer-smoke-lib.mjs';

const rootDir = process.cwd();
const DEFAULT_TIMEOUT_MS = 300_000;

const fail = (code, message, details = {}) => {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(1);
};

const runCommand = (command, args, { cwd = rootDir, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, signal: null, stdout, stderr: `${stderr}${err.message}`, timedOut });
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
  });

const assertExists = async (filePath, checkName, checks) => {
  await fs.access(filePath);
  checks.push(checkName);
};

const main = async () => {
  if (process.platform !== 'win32') {
    fail('windows-installer-platform-mismatch', 'Windows installer smoke requires win32.', {
      platform: process.platform,
    });
  }

  const installerPath = path.resolve(
    process.env.CODEXMUX_WINDOWS_INSTALLER_PATH
    || findWindowsInstaller(path.join(rootDir, 'release'))
    || '',
  );
  const smokeRoot = process.env.CODEXMUX_WINDOWS_INSTALLER_SMOKE_ROOT
    || await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-installer-smoke-'));
  const installDir = process.env.CODEXMUX_WINDOWS_INSTALL_DIR
    || path.join(smokeRoot, 'app');
  const checks = [];
  let installResult = null;
  let launchResult = null;
  let uninstallResult = null;
  let failurePayload = null;
  const paths = resolveInstalledAppPaths(installDir);

  try {
    if (!installerPath) throw new Error('Windows installer not found under release/.');
    await fs.access(installerPath);
    checks.push('installer-present');

    installResult = await runCommand(installerPath, buildNsisSilentInstallArgs(installDir), {
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_INSTALLER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    });
    if (installResult.exitCode !== 0 || installResult.timedOut) {
      throw new Error(`installer failed: ${JSON.stringify({
        exitCode: installResult.exitCode,
        signal: installResult.signal,
        timedOut: installResult.timedOut,
        stderr: installResult.stderr.slice(-1200),
      })}`);
    }
    checks.push('silent-install');

    await assertExists(paths.appExe, 'installed-exe-present', checks);
    await assertExists(paths.appAsar, 'installed-app-asar-present', checks);
    await assertExists(paths.uninstaller, 'uninstaller-present', checks);

    if (process.env.CODEXMUX_WINDOWS_INSTALLER_SKIP_LAUNCH !== '1') {
      launchResult = await runCommand(process.execPath, ['scripts/smoke-windows-packaged-launch.mjs'], {
        env: {
          ...process.env,
          CODEXMUX_WINDOWS_PACKAGED_APP_PATH: paths.appExe,
          CODEXMUX_WINDOWS_PACKAGED_LAUNCH_HOME: path.join(smokeRoot, 'home'),
        },
        timeoutMs: 90_000,
      });
      if (launchResult.exitCode !== 0 || launchResult.timedOut) {
        throw new Error(`installed app launch smoke failed: ${JSON.stringify({
          exitCode: launchResult.exitCode,
          signal: launchResult.signal,
          timedOut: launchResult.timedOut,
          stderr: launchResult.stderr.slice(-1600),
          stdout: launchResult.stdout.slice(-1600),
        })}`);
      }
      checks.push('installed-app-launch-smoke');
    }

    uninstallResult = await runCommand(paths.uninstaller, ['/S'], { timeoutMs: 90_000 });
    if (uninstallResult.exitCode !== 0 || uninstallResult.timedOut) {
      throw new Error(`uninstaller failed: ${JSON.stringify({
        exitCode: uninstallResult.exitCode,
        signal: uninstallResult.signal,
        timedOut: uninstallResult.timedOut,
        stderr: uninstallResult.stderr.slice(-1200),
      })}`);
    }
    checks.push('silent-uninstall');

    console.log(JSON.stringify({
      ok: true,
      mutatesSystem: true,
      installerPath,
      installDir,
      checks,
      launch: launchResult?.stdout ? JSON.parse(launchResult.stdout) : null,
    }, null, 2));
  } catch (err) {
    failurePayload = {
      ok: false,
      code: 'windows-installer-install-smoke-failed',
      message: err instanceof Error ? err.message : String(err),
      installerPath,
      installDir,
      checks,
      installResult,
      launchResult,
      uninstallResult,
    };
  } finally {
    try {
      await fs.access(paths.uninstaller);
      uninstallResult = await runCommand(paths.uninstaller, ['/S'], { timeoutMs: 90_000 });
    } catch {
      // Nothing to uninstall.
    }
    await fs.rm(smokeRoot, { recursive: true, force: true }).catch(() => null);
  }

  if (failurePayload) {
    failurePayload.uninstallResult = uninstallResult;
    console.error(JSON.stringify(failurePayload, null, 2));
    process.exit(1);
  }
};

main();
