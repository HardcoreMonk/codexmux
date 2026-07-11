#!/usr/bin/env node
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import net from 'net';
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
  buildElectronRuntimeV2EvalScript,
  buildElectronSmokeLaunchCommand,
  selectElectronLocalPageTarget,
} from './electron-smoke-lib.mjs';
import {
  buildWindowsAppProcessIdScript,
  buildWindowsPackagedIsolatedEnv,
  buildWindowsUploadRequestHead,
  isReservedWindowsUploadStageName,
  parseWindowsProcessIds,
  resolveWindowsPackagedLaunchMode,
  validateWindowsUploadIntegrityEvidence,
  validateWindowsUploadReceiptLocation,
} from './windows-packaged-launch-smoke-lib.mjs';
import {
  collectPaneNodes,
  extractCookieHeader,
  resolveSmokeTerminalEndpoint,
} from './runtime-v2-phase2-smoke-lib.mjs';
import {
  runtimeV2Phase6ExpectedModes,
  validateRuntimeV2Phase6Gate,
} from './runtime-v2-phase6-gate-lib.mjs';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import { buildWindowsPackagedLaunchArtifactPayload } from './windows-package-smoke-artifact-lib.mjs';

const DEFAULT_TIMEOUT_MS = 45_000;
const PASSWORD = 'windows-packaged-runtime-v2-smoke';
const rootDir = process.cwd();
const startedAt = new Date().toISOString();
const mode = resolveWindowsPackagedLaunchMode({ argv: process.argv, env: process.env });

const writeArtifact = async (status, payload) =>
  writeSmokeArtifact({
    smokeName: mode.smokeName,
    status,
    startedAt,
    payload: buildWindowsPackagedLaunchArtifactPayload(payload),
  }).catch((err) => {
    console.error(JSON.stringify({
      ok: false,
      code: 'smoke-artifact-write-failed',
      message: err instanceof Error ? err.message : String(err),
    }, null, 2));
  });

const fail = async (code, message, details = {}) => {
  const payload = { ok: false, code, message, ...details };
  await writeArtifact('failed', payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
};

const resolveAppPath = () =>
  path.resolve(process.env.CODEXMUX_WINDOWS_PACKAGED_APP_PATH || path.join(rootDir, 'release', 'win-unpacked', 'codexmux.exe'));

const buildIsolatedEnv = (homeDir, { uploadsDisabled = false } = {}) => ({
  ...buildWindowsPackagedIsolatedEnv({
    baseEnv: process.env,
    homeDir,
    initPassword: mode.uploadIntegrity ? PASSWORD : undefined,
    uploadsDisabled,
  }),
  CODEXMUX_RUNTIME_V2: process.env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_V2 ?? '1',
  CODEXMUX_RUNTIME_TERMINAL_V2_MODE:
    process.env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_TERMINAL_V2_MODE ?? 'new-tabs',
  CODEXMUX_RUNTIME_STORAGE_V2_MODE:
    process.env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_STORAGE_V2_MODE ?? 'default',
  CODEXMUX_RUNTIME_TIMELINE_V2_MODE:
    process.env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_TIMELINE_V2_MODE ?? 'default',
  CODEXMUX_RUNTIME_STATUS_V2_MODE:
    process.env.CODEXMUX_WINDOWS_PACKAGED_RUNTIME_STATUS_V2_MODE ?? 'default',
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

const jsonRequest = async (baseUrl, pathname, cookie, init = {}) => {
  const headers = {
    ...(cookie ? { Cookie: cookie } : {}),
    ...(init.body ? {
      'Content-Type': 'application/json',
      Origin: new URL(baseUrl).origin,
    } : {}),
    ...(init.headers ?? {}),
  };
  const res = await fetch(new URL(pathname, baseUrl), { ...init, headers });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${res.status} ${text}`);
  return data;
};

const login = async (baseUrl) => {
  const res = await fetch(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const cookie = extractCookieHeader(res);
  if (!cookie) throw new Error('login did not return a session cookie');
  return cookie;
};

const ensureLoggedIn = async (baseUrl) => {
  const setup = await jsonRequest(baseUrl, '/api/auth/setup', '');
  if (setup?.needsSetup) {
    const setupCookie = setup.requiresAuth ? await login(baseUrl) : '';
    await jsonRequest(baseUrl, '/api/auth/setup', setupCookie, {
      method: 'POST',
      body: JSON.stringify({
        authPassword: PASSWORD,
        locale: 'ko',
        appTheme: 'dark',
        dangerouslySkipPermissions: true,
        networkAccess: 'localhost',
      }),
    });
  }
  return login(baseUrl);
};

const sha256Bytes = (value) => createHash('sha256').update(value).digest('hex');

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.once('error', reject);
  stream.once('end', () => resolve(hash.digest('hex')));
});

const pathExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const uploadBytes = async ({
  baseUrl,
  pathname = '/api/upload-file',
  cookie,
  body,
  contentType = 'application/octet-stream',
  filename,
  workspaceId,
  tabId,
}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: new URL(baseUrl).origin,
      'Content-Length': String(body.byteLength),
      'Content-Type': contentType,
      'X-Cmux-Filename': encodeURIComponent(filename),
      'X-Cmux-Ws-Id': workspaceId,
      'X-Cmux-Tab-Id': tabId,
    },
    body,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Status and raw text remain available for a bounded smoke failure.
  }
  return { status: response.status, data, text };
};

const uploadDirectory = (homeDir, workspaceId, tabId) =>
  path.join(homeDir, '.codexmux', 'uploads', workspaceId, tabId);

const listDirectoryNames = async (directory) =>
  fs.readdir(directory).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });

const listUploadFiles = async (homeDir) => {
  const root = path.join(homeDir, '.codexmux', 'uploads');
  const files = [];
  const visit = async (directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  };
  await visit(root);
  return files.sort();
};

const openPartialUpload = async ({
  baseUrl,
  cookie,
  contentLength,
  partialBody,
  workspaceId,
  tabId,
}) => {
  const url = new URL(baseUrl);
  const socket = net.createConnection({
    host: url.hostname,
    port: Number(url.port),
  });
  socket.on('error', () => undefined);
  const closed = new Promise((resolve) => socket.once('close', resolve));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const head = buildWindowsUploadRequestHead({
    baseUrl,
    pathname: '/api/upload-file',
    cookie,
    contentLength,
    contentType: 'application/octet-stream',
    filename: 'partial-upload.bin',
    workspaceId,
    tabId,
  });
  await new Promise((resolve, reject) => {
    socket.write(Buffer.concat([Buffer.from(head), partialBody]), (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return { socket, closed };
};

const setElectronCookie = async (cdp, baseUrl, cookie) => {
  const [pair] = cookie.split(';');
  const index = pair.indexOf('=');
  const name = pair.slice(0, index);
  const value = pair.slice(index + 1);
  if (!name || !value) throw new Error(`invalid cookie: ${cookie}`);
  await cdp.send('Network.enable');
  const result = await cdp.send('Network.setCookie', {
    url: baseUrl,
    name,
    value,
    path: '/',
  });
  if (result && result.success === false) throw new Error(`Network.setCookie failed: ${JSON.stringify(result)}`);
};

const verifyRuntimeV2Terminal = async ({ cdp, baseUrl, cookie, checks }) => {
  await setElectronCookie(cdp, baseUrl, cookie);
  checks.push('electron-cookie');

  const pageAuth = await evaluate(cdp, `fetch(${JSON.stringify(new URL('/api/v2/workspaces', baseUrl).toString())}, { credentials: 'include' }).then(async (res) => ({ ok: res.ok, status: res.status }))`);
  if (!pageAuth.ok) throw new Error(`Electron page cookie auth failed: ${JSON.stringify(pageAuth)}`);
  checks.push('electron-page-auth');

  let workspaceId = null;
  try {
    const workspace = await jsonRequest(baseUrl, '/api/v2/workspaces', cookie, {
      method: 'POST',
      body: JSON.stringify({ name: 'Windows Packaged Runtime v2 Smoke', defaultCwd: rootDir }),
    });
    workspaceId = workspace.id;
    checks.push('runtime-v2-workspace-create');

    const layout = await jsonRequest(baseUrl, `/api/v2/workspaces/${encodeURIComponent(workspaceId)}/layout`, cookie);
    const pane = collectPaneNodes(layout)[0];
    if (!pane) throw new Error('workspace layout did not include a pane');

    const runtimeTab = await jsonRequest(
      baseUrl,
      '/api/v2/tabs',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          paneId: pane.id,
          cwd: rootDir,
        }),
      },
    );
    if (runtimeTab.runtimeVersion !== 2 || resolveSmokeTerminalEndpoint(runtimeTab) !== '/api/v2/terminal') {
      throw new Error(`new terminal tab did not route to runtime v2: ${JSON.stringify(runtimeTab)}`);
    }
    checks.push('runtime-v2-tab-create');

    const marker = `windows-packaged-runtime-v2-${Date.now()}`;
    const terminalResult = await evaluate(cdp, buildElectronRuntimeV2EvalScript({
      sessionName: runtimeTab.sessionName,
      marker,
      commandKind: 'windows',
      cols: 100,
      rows: 30,
      timeoutMs: 30_000,
    }));
    if (!terminalResult?.output?.includes(marker) || !String(terminalResult.url).includes('/api/v2/terminal')) {
      throw new Error(`Windows packaged runtime v2 marker missing: ${JSON.stringify(terminalResult)}`);
    }
    checks.push('runtime-v2-terminal-ws');

    await jsonRequest(baseUrl, `/api/v2/workspaces/${encodeURIComponent(workspaceId)}`, cookie, { method: 'DELETE' });
    workspaceId = null;
    checks.push('runtime-v2-workspace-delete');

    return {
      tabId: runtimeTab.id,
      sessionName: runtimeTab.sessionName,
      runtimeVersion: runtimeTab.runtimeVersion,
      marker,
    };
  } finally {
    if (workspaceId) {
      await jsonRequest(baseUrl, `/api/v2/workspaces/${encodeURIComponent(workspaceId)}`, cookie, { method: 'DELETE' }).catch(() => null);
    }
  }
};

const verifyRuntimeV2Phase6Gate = async ({ baseUrl, cookie, checks }) => {
  const [runtimeHealth, perf] = await Promise.all([
    jsonRequest(baseUrl, '/api/v2/runtime/health', cookie),
    jsonRequest(baseUrl, '/api/debug/perf', cookie),
  ]);
  const result = validateRuntimeV2Phase6Gate({ health: runtimeHealth, perf });
  if (!result.ok) {
    throw new Error(`runtime v2 Phase 6 gate failed: ${JSON.stringify(result.failures)}`);
  }
  checks.push('runtime-v2-phase6-gate');
  return {
    ok: true,
    expectedModes: runtimeV2Phase6ExpectedModes,
    actualModes: {
      terminalV2Mode: runtimeHealth?.terminalV2Mode ?? null,
      storageV2Mode: runtimeHealth?.storageV2Mode ?? null,
      timelineV2Mode: runtimeHealth?.timelineV2Mode ?? null,
      statusV2Mode: runtimeHealth?.statusV2Mode ?? null,
    },
    checks: result.checks,
  };
};

const verifyRuntimeV2Disabled = async ({ baseUrl, checks }) => {
  const cookie = await ensureLoggedIn(baseUrl);
  checks.push('server-login-rollback');
  const res = await fetch(new URL('/api/v2/runtime/health', baseUrl), {
    headers: { Cookie: cookie },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status !== 404 || data?.error !== 'runtime-v2-disabled') {
    throw new Error(`runtime v2 rollback-disabled health check failed: ${res.status} ${text}`);
  }
  checks.push('runtime-v2-disabled-health');
  return {
    ok: true,
    status: res.status,
    error: data.error,
  };
};

const verifyWindowsUploadIntegrity = async ({ baseUrl, cookie, homeDir, checks }) => {
  const workspaceId = 'windows-smoke';
  const tabId = 'upload-integrity';
  const payload = Buffer.alloc(1024 * 1024 + 137, 0x5a);
  const expectedSha256 = sha256Bytes(payload);
  const uploaded = await uploadBytes({
    baseUrl,
    cookie,
    body: payload,
    filename: 'native-publish-payload.bin',
    workspaceId,
    tabId,
  });
  if (uploaded.status !== 200 || !uploaded.data?.path || !uploaded.data?.filename) {
    throw new Error(`native upload failed: ${uploaded.status} ${uploaded.text}`);
  }
  const receiptLocation = validateWindowsUploadReceiptLocation({
    homeDir,
    workspaceId,
    tabId,
    filePath: uploaded.data.path,
    filename: uploaded.data.filename,
  });
  const uploadedStat = await fs.stat(uploaded.data.path);
  const actualSha256 = await sha256File(uploaded.data.path);
  if (
    !receiptLocation.valid
    || uploadedStat.size !== payload.length
    || actualSha256 !== expectedSha256
  ) {
    throw new Error('native upload integrity mismatch');
  }
  checks.push('upload-native-commit-size-sha-directory');

  const abortWorkspaceId = 'windows-smoke';
  const abortTabId = 'abort-cleanup';
  const abortDirectory = uploadDirectory(homeDir, abortWorkspaceId, abortTabId);
  const beforeAbort = new Set(await listDirectoryNames(abortDirectory));
  const partial = await openPartialUpload({
    baseUrl,
    cookie,
    contentLength: 1024 * 1024,
    partialBody: Buffer.alloc(64 * 1024, 0x61),
    workspaceId: abortWorkspaceId,
    tabId: abortTabId,
  });
  const stagedPath = await waitFor('Windows reserved staged upload', async () => {
    const names = await listDirectoryNames(abortDirectory);
    const staged = names.find((name) => (
      !beforeAbort.has(name) && isReservedWindowsUploadStageName(name)
    ));
    return staged ? path.join(abortDirectory, staged) : null;
  }, DEFAULT_TIMEOUT_MS);
  const stagedObservedBeforeAbort = await pathExists(stagedPath);
  if (!stagedObservedBeforeAbort) {
    throw new Error('reserved staged upload disappeared before abort');
  }
  partial.socket.destroy();
  await Promise.race([
    partial.closed,
    sleep(5_000).then(() => {
      throw new Error('partial upload socket close timed out');
    }),
  ]);
  await waitFor('Windows staged upload unlink after abort', async () => (
    !(await pathExists(stagedPath))
  ), DEFAULT_TIMEOUT_MS);
  const stagedExistsAfterAbort = await pathExists(stagedPath);
  const abortRemainder = await listDirectoryNames(abortDirectory);
  if (abortRemainder.length > 0) {
    throw new Error(`aborted upload left files: ${abortRemainder.join(',')}`);
  }
  checks.push('upload-staged-observed-before-abort');
  checks.push('upload-staged-unlinked-after-abort');

  const cleanupWorkspaceId = 'windows-smoke';
  const cleanupTabId = 'staged-cleanup';
  const committedPart = await uploadBytes({
    baseUrl,
    cookie,
    body: Buffer.from('committed part payload'),
    filename: 'survivor.part',
    workspaceId: cleanupWorkspaceId,
    tabId: cleanupTabId,
  });
  if (
    committedPart.status !== 200
    || !committedPart.data?.path
    || !committedPart.data.filename?.endsWith('.part')
  ) {
    throw new Error(`committed .part upload failed: ${committedPart.status} ${committedPart.text}`);
  }
  const cleanupDirectory = uploadDirectory(homeDir, cleanupWorkspaceId, cleanupTabId);
  const stagedToken = createHash('sha256')
    .update(`windows-upload-stage-${Date.now()}`)
    .digest('hex')
    .slice(0, 32);
  const agedStagePath = path.join(cleanupDirectory, `.${stagedToken}.upload.part`);
  await fs.writeFile(agedStagePath, 'aged reserved stage', { flag: 'wx' });
  const agedAt = new Date(Date.now() - 31 * 60 * 1000);
  await fs.utimes(agedStagePath, agedAt, agedAt);
  await jsonRequest(baseUrl, '/api/uploads/cleanup', cookie, {
    method: 'POST',
    body: JSON.stringify({ mode: 'expired' }),
  });
  const agedStageExistsAfterCleanup = await pathExists(agedStagePath);
  const committedPartExistsAfterCleanup = await pathExists(committedPart.data.path);
  if (agedStageExistsAfterCleanup) {
    throw new Error('aged reserved stage survived manual cleanup');
  }
  if (!committedPartExistsAfterCleanup) {
    throw new Error('committed .part file did not survive manual cleanup');
  }
  checks.push('upload-aged-reserved-stage-cleaned');
  checks.push('upload-committed-part-survives-staged-cleanup');

  return {
    receiptLocationValid: receiptLocation.valid,
    expectedBytes: payload.length,
    actualBytes: uploadedStat.size,
    expectedSha256,
    actualSha256,
    stagedObservedBeforeAbort,
    stagedExistsAfterAbort,
    agedStageExistsAfterCleanup,
    committedPartExistsAfterCleanup,
    uploadedBytes: uploadedStat.size,
  };
};

const verifyWindowsUploadKillSwitch = async ({ baseUrl, homeDir, checks }) => {
  const beforeFiles = await listUploadFiles(homeDir);
  const cookie = await ensureLoggedIn(baseUrl);
  checks.push('upload-kill-switch-login');
  const [image, file] = await Promise.all([
    uploadBytes({
      baseUrl,
      pathname: '/api/upload-image',
      cookie,
      body: Buffer.from('x'),
      contentType: 'image/png',
      filename: 'disabled.png',
      workspaceId: 'windows-smoke',
      tabId: 'kill-switch',
    }),
    uploadBytes({
      baseUrl,
      pathname: '/api/upload-file',
      cookie,
      body: Buffer.from('x'),
      filename: 'disabled.bin',
      workspaceId: 'windows-smoke',
      tabId: 'kill-switch',
    }),
  ]);
  for (const response of [image, file]) {
    if (response.status !== 503 || response.data?.code !== 'uploads-disabled') {
      throw new Error(`upload kill switch mismatch: ${response.status} ${response.text}`);
    }
  }
  checks.push('upload-kill-switch-exact-routes');

  const healthResponse = await fetch(new URL('/api/health', baseUrl));
  const configResponse = await fetch(new URL('/api/config', baseUrl), {
    headers: { Cookie: cookie },
  });
  const afterFiles = await listUploadFiles(homeDir);
  if (JSON.stringify(afterFiles) !== JSON.stringify(beforeFiles)) {
    throw new Error('disabled upload created or removed an upload artifact');
  }
  if (!healthResponse.ok) throw new Error(`health failed with upload kill switch: ${healthResponse.status}`);
  if (!configResponse.ok) {
    throw new Error(`authenticated config failed with upload kill switch: ${configResponse.status}`);
  }
  checks.push('upload-kill-switch-health');
  checks.push('upload-kill-switch-authenticated-api');

  return {
    disabledStatuses: [image.status, file.status],
    healthAvailable: healthResponse.ok,
    protectedApiAvailable: configResponse.ok,
  };
};

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

const waitForChildExit = async (child, timeoutMs = 3_000) => {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(timeoutMs),
  ]);
};

const requestElectronBrowserClose = async (cdp) => {
  if (!cdp) return;
  try {
    await cdp.send('Browser.close', {}, 1_500);
  } catch {
    // Browser.close can tear down the CDP socket before a response is sent.
  }
};

const listWindowsAppProcessIds = async (appPath) => {
  if (process.platform !== 'win32') return [];
  const script = buildWindowsAppProcessIdScript();

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

  return parseWindowsProcessIds(output);
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

const runDisabledPackagedUploadInstance = async ({
  appPath,
  homeDir,
  timeoutMs,
  checks,
  consoleEvents,
  existingAppPids,
  onOutput,
}) => {
  const remoteDebuggingPort = await getFreePort();
  const launch = buildElectronSmokeLaunchCommand({
    remoteDebuggingPort,
    appPath,
    platform: process.platform,
  });
  let electron = null;
  let cdp = null;
  try {
    electron = spawn(launch.command, launch.args, {
      cwd: path.dirname(appPath),
      env: buildIsolatedEnv(homeDir, { uploadsDisabled: true }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    electron.stdout.on('data', (chunk) => onOutput(chunk.toString()));
    electron.stderr.on('data', (chunk) => onOutput(chunk.toString()));
    checks.push('upload-kill-switch-packaged-launch');

    const target = await waitFor('Windows upload kill-switch Electron target', async () => {
      if (electron.exitCode !== null && launch.mode !== 'windows-exe') {
        throw new Error(`upload kill-switch instance exited early with ${electron.exitCode}`);
      }
      const targets = await fetchJson(
        `http://127.0.0.1:${remoteDebuggingPort}/json/list`,
      ).catch(() => null);
      return selectElectronLocalPageTarget(Array.isArray(targets) ? targets : []);
    }, timeoutMs);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    attachConsoleCollectors(cdp, consoleEvents);
    await enableCdpDomains(cdp);
    const state = await waitFor('Windows upload kill-switch page ready', async () => {
      const current = await readPageState(cdp);
      return current.readyState === 'complete' && current.origin.startsWith('http://')
        ? current
        : null;
    }, timeoutMs);
    const health = await fetchJson(new URL('/api/health', state.origin).toString());
    if (health?.app !== 'codexmux') {
      throw new Error(`upload kill-switch health failed: ${JSON.stringify(health)}`);
    }
    return await verifyWindowsUploadKillSwitch({
      baseUrl: state.origin,
      homeDir,
      checks,
    });
  } finally {
    await requestElectronBrowserClose(cdp);
    if (cdp) cdp.close();
    await waitForChildExit(electron);
    await stopProcessTree(electron);
    await stopWindowsAppProcesses(appPath, existingAppPids);
  }
};

const main = async () => {
  if (process.platform !== 'win32') {
    await fail('windows-packaged-launch-platform-mismatch', 'Windows packaged launch smoke requires win32.', {
      platform: process.platform,
    });
  }

  const appPath = resolveAppPath();
  const timeoutMs = Number(process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const remoteDebuggingPort = process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_PORT
    ? Number(process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_PORT)
    : await getFreePort();
  const homeDir = mode.uploadIntegrity
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-windows-upload-integrity-'))
    : process.env.CODEXMUX_WINDOWS_PACKAGED_LAUNCH_HOME
      || await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-windows-packaged-launch-'));
  const checks = [];
  const consoleEvents = [];
  const runRuntimeV2Terminal = mode.runtimeV2Terminal;
  const expectRuntimeV2Disabled = process.env.CODEXMUX_WINDOWS_PACKAGED_EXPECT_RUNTIME_V2_DISABLED === '1';
  let electron = null;
  let cdp = null;
  let launch = null;
  let output = '';
  let runtimeV2Terminal = null;
  let runtimeV2Phase6 = null;
  let runtimeV2Disabled = null;
  let uploadIntegrity = null;
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
    if (mode.uploadIntegrity && launch.mode !== 'windows-exe') {
      throw new Error(`Windows upload integrity smoke requires a packaged executable: ${appPath}`);
    }
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

    if (expectRuntimeV2Disabled && !mode.uploadIntegrity) {
      runtimeV2Disabled = await verifyRuntimeV2Disabled({ baseUrl: state.origin, checks });
    }

    if (runRuntimeV2Terminal) {
      const cookie = await ensureLoggedIn(state.origin);
      checks.push('server-login');
      runtimeV2Terminal = await verifyRuntimeV2Terminal({
        cdp,
        baseUrl: state.origin,
        cookie,
        checks,
      });
      runtimeV2Phase6 = await verifyRuntimeV2Phase6Gate({
        baseUrl: state.origin,
        cookie,
        checks,
      });
    }

    if (mode.uploadIntegrity) {
      const cookie = await ensureLoggedIn(state.origin);
      checks.push('upload-integrity-server-login');
      const nativeEvidence = await verifyWindowsUploadIntegrity({
        baseUrl: state.origin,
        cookie,
        homeDir,
        checks,
      });

      await requestElectronBrowserClose(cdp);
      if (cdp) cdp.close();
      cdp = null;
      await waitForChildExit(electron, 5_000);
      await stopProcessTree(electron);
      electron = null;
      await stopWindowsAppProcesses(appPath, existingAppPids);
      checks.push('upload-integrity-normal-instance-stopped');

      const killSwitchEvidence = await runDisabledPackagedUploadInstance({
        appPath,
        homeDir,
        timeoutMs,
        checks,
        consoleEvents,
        existingAppPids,
        onOutput: (chunk) => {
          output += chunk;
        },
      });
      const evidence = validateWindowsUploadIntegrityEvidence({
        ...nativeEvidence,
        ...killSwitchEvidence,
      });
      if (!evidence.ok) {
        throw new Error(`Windows upload integrity evidence failed: ${evidence.failures.join(', ')}`);
      }
      uploadIntegrity = {
        verified: true,
        uploadedBytes: nativeEvidence.uploadedBytes,
        disabledStatuses: killSwitchEvidence.disabledStatuses,
      };
      checks.push('upload-integrity-evidence-complete');
    }

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

    const successPayload = {
      ok: true,
      mutatesSystem: false,
      appPath,
      homeDir,
      launchMode: launch.mode,
      remoteDebuggingPort,
      checks,
      state,
      health,
      runtimeV2Terminal,
      runtimeV2Phase6,
      runtimeV2Disabled,
      uploadIntegrity,
      consoleEventCount: consoleEvents.length,
      blockingConsoleCount: blockingConsole.length,
    };
    await writeArtifact('passed', successPayload);
    console.log(JSON.stringify(successPayload, null, 2));
  } catch (err) {
    await fail('windows-packaged-launch-smoke-failed', err instanceof Error ? err.message : String(err), {
      appPath,
      homeDir,
      launchMode: launch?.mode,
      remoteDebuggingPort,
      checks,
      runtimeV2TerminalRequested: runRuntimeV2Terminal,
      uploadIntegrityRequested: mode.uploadIntegrity,
      expectRuntimeV2Disabled,
      outputTail: output.slice(-2000),
      consoleEvents: consoleEvents.slice(-20),
    });
  } finally {
    await requestElectronBrowserClose(cdp);
    if (cdp) cdp.close();
    await waitForChildExit(electron);
    await stopProcessTree(electron);
    await stopWindowsAppProcesses(appPath, existingAppPids);
  }
};

main();
