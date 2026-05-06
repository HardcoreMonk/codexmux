#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import {
  attachConsoleCollectors,
  collectBlockingConsoleEvents,
  connectCdp,
  enableCdpDomains,
  evaluate,
  fetchJson,
  getFreePort,
  sleep,
  waitFor,
} from './android-webview-smoke-lib.mjs';
import {
  buildElectronSmokeLaunchCommand,
  selectElectronLocalPageTarget,
} from './electron-smoke-lib.mjs';

const DEFAULT_TIMEOUT_MS = 45_000;
const rootDir = process.cwd();

const fail = (code, message, details = {}) => {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(1);
};

const resolveAppPath = () =>
  path.resolve(process.env.CODEXMUX_WINDOWS_PACKAGED_APP_PATH || path.join(rootDir, 'release', 'win-unpacked', 'codexmux.exe'));

const buildIsolatedEnv = (homeDir) => ({
  ...process.env,
  HOME: homeDir,
  USERPROFILE: homeDir,
  APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  NO_AT_BRIDGE: '1',
  CODEXMUX_RUNTIME_V2: '1',
  CODEXMUX_RUNTIME_TERMINAL_ADAPTER: 'windows',
  CODEXMUX_PROCESS_INSPECTOR_ADAPTER: 'windows',
});

const prepareIsolatedEnvDirs = async (homeDir) => {
  await fs.mkdir(path.join(homeDir, 'AppData', 'Roaming'), { recursive: true });
  await fs.mkdir(path.join(homeDir, 'AppData', 'Local'), { recursive: true });
};

const readPageState = (cdp) =>
  evaluate(cdp, `(() => ({
    href: location.href,
    origin: location.origin,
    title: document.title,
    readyState: document.readyState,
    hasElectronApi: !!window.electronAPI,
    electronApiKeys: Object.keys(window.electronAPI || {}).sort(),
    hasPasswordInput: !!document.querySelector('input[type="password"]'),
    userAgent: navigator.userAgent
  }))()`);

const stopProcessTree = async (child) => {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('exit', resolve);
      killer.once('error', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
};

const listWindowsAppProcessIds = async (appPath) => {
  if (process.platform !== 'win32') return [];
  const script = [
    '$target = $env:CODEXMUX_SMOKE_APP_PATH',
    'Get-Process -Name codexmux -ErrorAction SilentlyContinue |',
    '  Where-Object { $_.Path -eq $target } |',
    '  Select-Object -ExpandProperty Id',
  ].join(' ');

  const output = await new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
      env: {
        ...process.env,
        CODEXMUX_SMOKE_APP_PATH: appPath,
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.once('close', () => resolve(stdout));
    child.once('error', () => resolve(''));
  });

  return String(output)
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
};

const stopWindowsAppProcesses = async (appPath, excludePids = []) => {
  const exclude = new Set(excludePids);
  const pids = (await listWindowsAppProcessIds(appPath)).filter((pid) => !exclude.has(pid));
  await Promise.all(pids.map((pid) => new Promise((resolve) => {
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    child.once('exit', resolve);
    child.once('error', resolve);
  })));
};

const main = async () => {
  if (process.platform !== 'win32') {
    fail('windows-packaged-launch-platform-mismatch', 'Windows packaged launch smoke requires win32.', {
      platform: process.platform,
    });
  }

  const appPath = resolveAppPath();
  const timeoutMs = Number(process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const remoteDebuggingPort = process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_PORT
    ? Number(process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_PORT)
    : await getFreePort();
  const homeDir = process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_HOME
    || await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-windows-packaged-launch-'));
  const checks = [];
  const consoleEvents = [];
  let electron = null;
  let cdp = null;
  let launch = null;
  let output = '';
  const existingAppPids = await listWindowsAppProcessIds(appPath);

  try {
    await fs.access(appPath);
    checks.push('packaged-exe-present');
    await prepareIsolatedEnvDirs(homeDir);
    checks.push('isolated-user-dirs');

    launch = buildElectronSmokeLaunchCommand({
      remoteDebuggingPort,
      appPath,
      platform: process.platform,
    });
    electron = spawn(launch.command, launch.args, {
      cwd: path.dirname(appPath),
      env: buildIsolatedEnv(homeDir),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    checks.push(`packaged-launch-${launch.mode}`);

    electron.stdout.on('data', (chunk) => { output += chunk.toString(); });
    electron.stderr.on('data', (chunk) => { output += chunk.toString(); });

    const target = await waitFor('Windows packaged Electron local page target', async () => {
      if (electron.exitCode !== null && launch.mode !== 'windows-exe') {
        throw new Error(`packaged Electron exited early with ${electron.exitCode}: ${output.slice(-1800)}`);
      }
      const targets = await fetchJson(`http://127.0.0.1:${remoteDebuggingPort}/json/list`).catch(() => null);
      return selectElectronLocalPageTarget(Array.isArray(targets) ? targets : []);
    }, timeoutMs);
    checks.push('local-page-target');

    cdp = await connectCdp(target.webSocketDebuggerUrl);
    attachConsoleCollectors(cdp, consoleEvents);
    await enableCdpDomains(cdp);
    checks.push('cdp-connected');

    const state = await waitFor('Windows packaged Electron page ready', async () => {
      const current = await readPageState(cdp);
      return current.readyState === 'complete' && current.origin.startsWith('http://') ? current : null;
    }, timeoutMs);
    checks.push('page-ready');

    if (!state.hasElectronApi) {
      throw new Error(`Electron preload bridge is missing: ${JSON.stringify(state)}`);
    }
    checks.push('preload-bridge');

    const health = await fetchJson(new URL('/api/health', state.origin).toString());
    if (health?.app !== 'codexmux') throw new Error(`packaged local server health failed: ${JSON.stringify(health)}`);
    checks.push('local-server-health');

    const blockingOutput = [
      /NODE_MODULE_VERSION/i,
      /Runtime v2 worker script is missing/i,
      /runtime v2 startup diagnostic failed/i,
    ].filter((pattern) => pattern.test(output));
    if (blockingOutput.length > 0) {
      throw new Error(`packaged runtime output contains blocking diagnostics: ${blockingOutput.map(String).join(', ')}`);
    }
    checks.push('runtime-output-clean');

    await sleep(1_000);
    const blockingConsole = collectBlockingConsoleEvents(consoleEvents);
    if (blockingConsole.length > 0) {
      throw new Error(`blocking console events: ${JSON.stringify(blockingConsole.slice(0, 20))}`);
    }
    checks.push('console-clean');

    console.log(JSON.stringify({
      ok: true,
      mutatesSystem: false,
      appPath,
      homeDir,
      launchMode: launch.mode,
      remoteDebuggingPort,
      checks,
      state,
      health,
      consoleEventCount: consoleEvents.length,
      blockingConsoleCount: blockingConsole.length,
    }, null, 2));
  } catch (err) {
    fail('windows-packaged-launch-smoke-failed', err instanceof Error ? err.message : String(err), {
      appPath,
      homeDir,
      launchMode: launch?.mode,
      remoteDebuggingPort,
      checks,
      outputTail: output.slice(-2000),
      consoleEvents: consoleEvents.slice(-20),
    });
  } finally {
    if (cdp) cdp.close();
    await stopProcessTree(electron);
    await stopWindowsAppProcesses(appPath, existingAppPids);
  }
};

main();
