#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import https from 'https';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import {
  getFreePort,
  sleep,
} from './android-webview-smoke-lib.mjs';
import { buildElectronSmokeLaunchCommand } from './electron-smoke-lib.mjs';
import {
  sanitizeSmokeArtifactPayload,
  writeSmokeArtifact,
} from './smoke-artifact-lib.mjs';
import {
  buildNsisSilentInstallArgs,
  findWindowsInstallerBelowVersion,
  findWindowsZipBelowVersion,
  getWindowsInstallerVersion,
  getWindowsZipVersion,
  resolveInstalledAppPaths,
} from './windows-installer-smoke-lib.mjs';
import {
  buildWindowsUpdaterSmokeEnv,
  filterWindowsUpdaterInstallerProcesses,
  parseWindowsUpdaterStatusEvents,
  summarizeWindowsUpdaterStatusEvents,
  withoutGitHubTokenEnv,
} from './windows-updater-local-feed-smoke-lib.mjs';
import {
  evaluateWindowsPublishedUpdateChannel,
  selectLatestPublishedRelease,
} from './windows-updater-published-channel-smoke-lib.mjs';

const rootDir = process.cwd();
const releaseDir = path.resolve(process.env.CODEXMUX_WINDOWS_RELEASE_DIR || path.join(rootDir, 'release'));
const DEFAULT_TIMEOUT_MS = 300_000;
const STATUS_TIMEOUT_MS = 180_000;
const APP_EXIT_TIMEOUT_MS = 120_000;
const SMOKE_NAME = 'windows-updater-published-install';
const startedAt = new Date().toISOString();

const summarizeCommandResult = (result) => {
  if (!result) return null;
  return {
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    timedOut: !!result.timedOut,
  };
};

const parsePackagedLaunchPayload = (stdout) => {
  const content = String(stdout || '').trim();
  const jsonStart = content.indexOf('{');
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(content.slice(jsonStart));
  } catch {
    return null;
  }
};

const buildArtifactPayload = ({
  ok,
  code,
  checks,
  blockers = [],
  latestReleaseTag,
  latestVersion,
  baselineVersion,
  referencedInstallerName,
  baselineInstallerName,
  baselinePackageName,
  baselinePackageType,
  publishedFeedMode,
  installResult,
  updateLaunchResult,
  postInstallLaunchResult,
  uninstallResult,
  statusSummary,
}) => sanitizeSmokeArtifactPayload({
  ok: ok === true,
  mutatesSystem: true,
  ...(code ? { code } : {}),
  latestReleaseTag: latestReleaseTag ?? null,
  latestVersion: latestVersion ?? null,
  baselineVersion: baselineVersion ?? null,
  referencedInstallerName: referencedInstallerName ?? null,
  baselineInstallerName: baselineInstallerName ?? null,
  baselinePackageName: baselinePackageName ?? baselineInstallerName ?? null,
  baselinePackageType: baselinePackageType ?? (baselineInstallerName ? 'installer' : null),
  publishedFeedMode: publishedFeedMode ?? null,
  downloadedFileName: statusSummary?.downloadedFileName ?? null,
  checks: Array.isArray(checks) ? checks : [],
  blockers: Array.isArray(blockers) ? blockers : [],
  statusSummary: statusSummary
    ? {
        ok: statusSummary.ok === true,
        latestVersion: statusSummary.latestVersion ?? null,
        downloadedFileName: statusSummary.downloadedFileName ?? null,
        checks: Array.isArray(statusSummary.checks) ? statusSummary.checks : [],
        blockers: Array.isArray(statusSummary.blockers) ? statusSummary.blockers : [],
      }
    : null,
  installResult: summarizeCommandResult(installResult),
  updateLaunchResult: summarizeCommandResult(updateLaunchResult),
  postInstallLaunchResult: summarizeCommandResult(postInstallLaunchResult),
  uninstallResult: summarizeCommandResult(uninstallResult),
});

const writeArtifact = async (status, payload) =>
  writeSmokeArtifact({
    smokeName: SMOKE_NAME,
    status,
    startedAt,
    payload: buildArtifactPayload(payload),
  }).catch(() => {
    console.error(JSON.stringify({
      ok: false,
      code: 'smoke-artifact-write-failed',
    }, null, 2));
  });

const fail = async (code, message, details = {}) => {
  const payload = { ok: false, code, message, ...details };
  await writeArtifact('failed', payload);
  console.error(JSON.stringify(buildArtifactPayload(payload), null, 2));
  process.exit(1);
};

const request = (url, { accept = 'application/vnd.github+json', redirectCount = 0 } = {}) =>
  new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    const req = https.get(url, {
      headers: {
        Accept: accept,
        'User-Agent': 'codexmux-windows-updater-published-install-smoke',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const statusCode = res.statusCode ?? 0;
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectCount < 5) {
        res.resume();
        resolve(request(new URL(location, url).toString(), { accept, redirectCount: redirectCount + 1 }));
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`GET ${url} failed with HTTP ${statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        resolve(body);
      });
    });
    req.once('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error(`GET ${url} timed out`));
    });
  });

const readYamlIfExists = async (filePath) => {
  try {
    return yaml.load(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
};

const normalizePublishConfig = (publishConfig) => {
  if (Array.isArray(publishConfig)) return publishConfig[0] ?? null;
  return publishConfig && typeof publishConfig === 'object' ? publishConfig : null;
};

const buildReleasesApiUrl = ({ owner, repo }) =>
  `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=10`;

const getAsset = (release, assetName) =>
  (Array.isArray(release?.assets) ? release.assets : [])
    .find((asset) => String(asset?.name || '').toLowerCase() === assetName.toLowerCase()) ?? null;

const buildPublishedGenericFeedUrl = (release) => {
  const latestYamlAsset = getAsset(release, 'latest.yml');
  if (!latestYamlAsset?.browser_download_url) return null;
  const url = new URL(latestYamlAsset.browser_download_url);
  url.pathname = url.pathname.replace(/\/latest\.yml$/i, '/');
  url.search = '';
  return url.toString();
};

const runCommand = (command, args, {
  cwd = rootDir,
  env = withoutGitHubTokenEnv(process.env),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child = null;
    try {
      child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ exitCode: 1, signal: null, stdout, stderr: err instanceof Error ? err.message : String(err), timedOut });
      return;
    }
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

const cleanupInstalledApp = async (installDir) => {
  const results = [];
  if (process.platform === 'win32') {
    for (const key of [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\de60276d-bfaf-53ab-ba86-fe534382d031',
      'HKCU\\Software\\de60276d-bfaf-53ab-ba86-fe534382d031',
    ]) {
      results.push(await runCommand('reg.exe', ['delete', key, '/f'], { timeoutMs: 30_000 }));
    }
  }
  await fs.rm(installDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1_000 });
  return {
    exitCode: results.every((result) => result.exitCode === 0 || /unable to find/i.test(result.stderr)) ? 0 : 1,
    signal: null,
    timedOut: results.some((result) => result.timedOut),
    stdout: results.map((result) => result.stdout).join('\n'),
    stderr: results.map((result) => result.stderr).join('\n'),
  };
};

const startCommand = (command, args, {
  cwd = rootDir,
  env = withoutGitHubTokenEnv(process.env),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let settled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const settle = (resolve, result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(result);
  };

  const result = new Promise((resolve) => {
    child.once('error', (err) => {
      settle(resolve, { exitCode: 1, signal: null, stdout, stderr: `${stderr}${err.message}`, timedOut });
    });
    child.once('exit', (exitCode, signal) => {
      settle(resolve, { exitCode, signal, stdout, stderr, timedOut });
    });
  });

  return { child, result };
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

const assertExists = async (filePath, checkName, checks) => {
  await fs.access(filePath);
  checks.push(checkName);
};

const readStatusEvents = async (statusPath) => {
  try {
    return parseWindowsUpdaterStatusEvents(await fs.readFile(statusPath, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
};

const waitForUpdaterStatus = async ({
  statusPath,
  requireConfigured,
  timeoutMs = STATUS_TIMEOUT_MS,
}) => {
  const deadline = Date.now() + timeoutMs;
  let lastSummary = summarizeWindowsUpdaterStatusEvents([], { requireConfigured });
  while (Date.now() < deadline) {
    const events = await readStatusEvents(statusPath);
    lastSummary = summarizeWindowsUpdaterStatusEvents(events, { requireConfigured });
    const errorBlocker = lastSummary.blockers.find((blocker) => blocker.ruleId === 'updater-error-event');
    if (errorBlocker) throw new Error(errorBlocker.message);
    if (lastSummary.ok) return { events, summary: lastSummary };
    await sleep(500);
  }

  throw new Error(`published updater status timed out; blockers=${lastSummary.blockers.map((blocker) => blocker.ruleId).join(',')}`);
};

const parseProcessJson = (stdout) => {
  const text = String(stdout || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
};

const listWindowsUpdaterInstallerProcesses = async ({ smokeRoot, installDir, includeUnscopedInstallers = false }) => {
  if (process.platform !== 'win32') return [];
  const script = `
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -like 'codexmux-Setup-*.exe' -or $_.Name -eq 'old-uninstaller.exe' } |
      Select-Object @{Name='processId';Expression={$_.ProcessId}}, @{Name='name';Expression={$_.Name}}, @{Name='commandLine';Expression={$_.CommandLine}} |
      ConvertTo-Json -Compress
  `;
  const result = await runCommand('powershell.exe', ['-NoProfile', '-Command', script], { timeoutMs: 30_000 });
  if (result.exitCode !== 0 || result.timedOut) return [];
  return filterWindowsUpdaterInstallerProcesses({
    smokeRoot,
    installDir,
    includeUnscopedInstallers,
    processes: parseProcessJson(result.stdout),
  });
};

const waitForUpdaterInstallerProcesses = async ({
  smokeRoot,
  installDir,
  includeUnscopedInstallers = false,
  timeoutMs = 120_000,
}) => {
  const deadline = Date.now() + timeoutMs;
  let running = [];
  while (Date.now() < deadline) {
    running = await listWindowsUpdaterInstallerProcesses({ smokeRoot, installDir, includeUnscopedInstallers });
    if (running.length === 0) return { ok: true, running: [] };
    await sleep(1_000);
  }
  return { ok: false, running };
};

const runPostInstallLaunchSmoke = async ({ appExe, smokeRoot, expectedVersion }) => {
  let lastResult = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = await runCommand(process.execPath, ['scripts/smoke-windows-packaged-launch.mjs'], {
      env: withoutGitHubTokenEnv({
        ...process.env,
        CODEXMUX_ELECTRON_UPDATER_DISABLED: '1',
        CODEXMUX_WINDOWS_PACKAGED_APP_PATH: appExe,
        CODEXMUX_WINDOWS_PACKAGED_LAUNCH_HOME: path.join(smokeRoot, `post-update-home-${attempt}`),
      }),
      timeoutMs: 90_000,
    });
    const launchPayload = parsePackagedLaunchPayload(lastResult.stdout);
    if (
      lastResult.exitCode === 0
      && !lastResult.timedOut
      && launchPayload?.health?.version === expectedVersion
    ) {
      return lastResult;
    }
    await sleep(5_000);
  }
  return lastResult;
};

const runPublishedUpdateAttempt = async ({
  appExe,
  installDir,
  smokeRoot,
  attempt,
  feedUrl,
}) => {
  const updaterHomeDir = path.join(smokeRoot, `updater-home-${attempt}`);
  const statusPath = path.join(smokeRoot, `updater-status-${attempt}.jsonl`);
  await fs.mkdir(path.join(updaterHomeDir, 'AppData', 'Roaming'), { recursive: true });
  await fs.mkdir(path.join(updaterHomeDir, 'AppData', 'Local'), { recursive: true });

  const remoteDebuggingPort = await getFreePort();
  const launch = buildElectronSmokeLaunchCommand({
    remoteDebuggingPort,
    appPath: appExe,
    platform: process.platform,
  });
  const updateLaunch = startCommand(launch.command, launch.args, {
    cwd: path.dirname(appExe),
    env: buildWindowsUpdaterSmokeEnv({
      env: process.env,
      feedUrl,
      statusPath,
      installDir,
      homeDir: updaterHomeDir,
      useRealLocalAppData: installDir == null,
    }),
    timeoutMs: Number(process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  });

  try {
    const requireConfigured = typeof feedUrl === 'string' && feedUrl.trim().length > 0;
    const updaterStatus = await waitForUpdaterStatus({
      statusPath,
      requireConfigured,
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALL_STATUS_TIMEOUT_MS || STATUS_TIMEOUT_MS),
    });
    const updateLaunchResult = await Promise.race([
      updateLaunch.result,
      sleep(Number(process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALL_APP_EXIT_TIMEOUT_MS || APP_EXIT_TIMEOUT_MS)).then(() => ({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: 'packaged app did not exit after published quitAndInstall',
        timedOut: true,
      })),
    ]);

    if (updateLaunchResult.exitCode !== 0 || updateLaunchResult.timedOut) {
      throw new Error(`published updater launch failed to exit cleanly: ${JSON.stringify({
        exitCode: updateLaunchResult.exitCode,
        signal: updateLaunchResult.signal,
        timedOut: updateLaunchResult.timedOut,
        stderr: updateLaunchResult.stderr.slice(-1600),
      })}`);
    }

    return {
      ok: true,
      statusSummary: updaterStatus.summary,
      updateLaunchResult,
    };
  } catch (err) {
    await stopProcessTree(updateLaunch.child);
    const events = await readStatusEvents(statusPath).catch(() => []);
    const updateLaunchResult = await Promise.race([
      updateLaunch.result,
      sleep(5_000).then(() => null),
    ]);
    return {
      ok: false,
      error: err,
      statusSummary: summarizeWindowsUpdaterStatusEvents(events, {
        requireConfigured: typeof feedUrl === 'string' && feedUrl.trim().length > 0,
      }),
      updateLaunchResult,
    };
  }
};

const extractWindowsZipBaseline = async ({ zipPath, installDir }) => {
  await fs.mkdir(installDir, { recursive: true });
  return runCommand('tar', ['-xf', zipPath, '-C', installDir], {
    timeoutMs: Number(process.env.CODEXMUX_WINDOWS_ZIP_EXTRACT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  });
};

const loadPublishedChannel = async ({ checks }) => {
  const builderConfig = await readYamlIfExists(path.join(rootDir, 'electron-builder.yml'));
  const publishConfig = normalizePublishConfig(builderConfig?.publish);
  const owner = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_OWNER || publishConfig?.owner;
  const repo = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_REPO || publishConfig?.repo;

  if (!owner || !repo) {
    throw new Error('electron-builder publish.owner/repo or CODEXMUX_WINDOWS_UPDATER_PUBLISHED_OWNER/REPO is required.');
  }
  checks.push('published-channel-config');

  const releasesUrl = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_RELEASES_URL
    || buildReleasesApiUrl({ owner, repo });
  const includePrerelease = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INCLUDE_PRERELEASE === '1';
  const targetTag = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_TAG?.trim() || null;
  const releases = JSON.parse(await request(releasesUrl));
  const latestRelease = selectLatestPublishedRelease({ releases, includePrerelease, targetTag });
  const latestYamlAsset = getAsset(latestRelease, 'latest.yml');
  const latestMetadata = latestYamlAsset?.browser_download_url
    ? yaml.load(await request(latestYamlAsset.browser_download_url, { accept: 'application/octet-stream' }))
    : null;

  return {
    releases,
    latestRelease,
    latestMetadata,
    includePrerelease,
    targetTag,
  };
};

const main = async () => {
  if (process.platform !== 'win32') {
    await fail('windows-updater-published-install-platform-mismatch', 'Windows updater published install smoke requires win32.', {
      platform: process.platform,
    });
  }

  const smokeRoot = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALL_SMOKE_ROOT
    || await fs.mkdtemp(path.join(os.tmpdir(), 'cmux-up-'));
  const explicitInstallDir = process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALL_DIR;
  const installDir = explicitInstallDir || path.join(smokeRoot, 'app');
  const updaterInstallDirOverride = installDir;
  const paths = resolveInstalledAppPaths(installDir);
  const checks = [];
  let installResult = null;
  let updateLaunchResult = null;
  let postInstallLaunchResult = null;
  let uninstallResult = null;
  let statusSummary = null;
  let failurePayload = null;
  let latestRelease = null;
  let latestMetadata = null;
  let baselinePackagePath = null;
  let baselinePackageType = null;
  let baselineVersion = null;
  let baselineInstallerName = null;
  let baselinePackageName = null;
  let publishedFeedMode = null;
  let publishedFeedUrl = null;
  let channelResult = null;

  try {
    const channel = await loadPublishedChannel({ checks });
    latestRelease = channel.latestRelease;
    latestMetadata = channel.latestMetadata;
    const latestVersion = typeof latestMetadata?.version === 'string' ? latestMetadata.version : null;
    if (!latestVersion) throw new Error('published latest.yml must include version before choosing a baseline installer.');
    checks.push('published-latest-version');

    const explicitBaselineZip = process.env.CODEXMUX_WINDOWS_PUBLISHED_BASE_ZIP_PATH;
    const baselineInstallerCandidate = process.env.CODEXMUX_WINDOWS_PUBLISHED_BASE_INSTALLER_PATH
      || (!explicitBaselineZip ? findWindowsInstallerBelowVersion(releaseDir, latestVersion) : null);
    const baselineZipCandidate = explicitBaselineZip
      || (!baselineInstallerCandidate ? findWindowsZipBelowVersion(releaseDir, latestVersion) : null);

    if (baselineInstallerCandidate) {
      baselinePackagePath = path.resolve(baselineInstallerCandidate);
      baselinePackageType = 'installer';
      baselineVersion = getWindowsInstallerVersion(baselinePackagePath);
      baselineInstallerName = path.basename(baselinePackagePath);
      baselinePackageName = baselineInstallerName;
      if (!baselineVersion) throw new Error(`Baseline installer name must include a semver version: ${baselineInstallerName}`);
      checks.push('baseline-installer-version');
    } else if (baselineZipCandidate) {
      baselinePackagePath = path.resolve(baselineZipCandidate);
      baselinePackageType = 'zip';
      baselineVersion = getWindowsZipVersion(baselinePackagePath);
      baselinePackageName = path.basename(baselinePackagePath);
      if (!baselineVersion) throw new Error(`Baseline zip name must include a semver version: ${baselinePackageName}`);
      checks.push('baseline-zip-version');
    } else {
      throw new Error(`No baseline installer or Windows zip below ${latestVersion} was found under ${releaseDir}.`);
    }

    channelResult = evaluateWindowsPublishedUpdateChannel({
      releases: channel.releases,
      currentVersion: baselineVersion,
      latestMetadata,
      includePrerelease: channel.includePrerelease,
      targetTag: channel.targetTag,
    });
    checks.push(...channelResult.checks.map((check) => `published-${check}`));
    if (!channelResult.ok) {
      throw new Error(`Published update channel is not ready: ${channelResult.blockers.map((blocker) => blocker.ruleId).join(',')}`);
    }
    checks.push('published-channel-updates-baseline');

    if (process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_GENERIC_FEED === '1') {
      publishedFeedUrl = buildPublishedGenericFeedUrl(latestRelease);
      if (!publishedFeedUrl) throw new Error('Published generic feed mode requires a latest.yml asset download URL.');
      publishedFeedMode = 'github-release-generic-feed';
      checks.push('published-generic-feed-url');
    } else {
      publishedFeedMode = 'github-provider';
    }

    await assertExists(
      baselinePackagePath,
      baselinePackageType === 'installer' ? 'baseline-installer-present' : 'baseline-zip-present',
      checks,
    );

    installResult = baselinePackageType === 'installer'
      ? await runCommand(
        baselinePackagePath,
        buildNsisSilentInstallArgs(installDir),
        {
          timeoutMs: Number(process.env.CODEXMUX_WINDOWS_INSTALLER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
        },
      )
      : await extractWindowsZipBaseline({ zipPath: baselinePackagePath, installDir });
    if (installResult.exitCode !== 0 || installResult.timedOut) {
      throw new Error(`baseline ${baselinePackageType} failed: ${JSON.stringify({
        exitCode: installResult.exitCode,
        signal: installResult.signal,
        timedOut: installResult.timedOut,
        stderr: installResult.stderr.slice(-1200),
      })}`);
    }
    checks.push(baselinePackageType === 'installer' ? 'silent-install-baseline' : 'baseline-zip-extract');

    await assertExists(paths.appExe, 'installed-exe-present', checks);
    await assertExists(paths.appAsar, 'installed-app-asar-present', checks);
    if (baselinePackageType === 'installer') {
      await assertExists(paths.uninstaller, 'uninstaller-present', checks);
    } else {
      checks.push('baseline-zip-no-uninstaller');
    }

    const maxUpdaterAttempts = Number(process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALL_ATTEMPTS || 2);
    let updaterAttempt = null;
    for (let attempt = 1; attempt <= maxUpdaterAttempts; attempt += 1) {
      checks.push(attempt === 1 ? 'installed-app-published-updater-launch' : `installed-app-published-updater-retry-${attempt}`);
      updaterAttempt = await runPublishedUpdateAttempt({
        appExe: paths.appExe,
        installDir: updaterInstallDirOverride,
        smokeRoot,
        attempt,
        feedUrl: publishedFeedUrl,
      });
      if (updaterAttempt.ok) break;
    }
    if (!updaterAttempt?.ok) {
      statusSummary = updaterAttempt?.statusSummary ?? null;
      updateLaunchResult = updaterAttempt?.updateLaunchResult ?? null;
      throw updaterAttempt?.error ?? new Error('published updater install attempt failed');
    }
    statusSummary = updaterAttempt.statusSummary;
    updateLaunchResult = updaterAttempt.updateLaunchResult;
    checks.push(...statusSummary.checks);
    checks.push('updater-app-exit-after-published-quit-and-install');

    const installerSettle = await waitForUpdaterInstallerProcesses({
      smokeRoot,
      installDir: updaterInstallDirOverride,
      timeoutMs: Number(process.env.CODEXMUX_WINDOWS_UPDATER_PUBLISHED_INSTALLER_SETTLE_TIMEOUT_MS || 300_000),
    });
    if (!installerSettle.ok) {
      throw new Error(`published updater installer processes did not settle: ${JSON.stringify(installerSettle.running)}`);
    }
    checks.push('updater-installer-processes-settled');

    postInstallLaunchResult = await runPostInstallLaunchSmoke({
      appExe: paths.appExe,
      smokeRoot,
      expectedVersion: latestMetadata.version,
    });
    if (postInstallLaunchResult.exitCode !== 0 || postInstallLaunchResult.timedOut) {
      throw new Error(`post-update installed app launch smoke failed: ${JSON.stringify({
        exitCode: postInstallLaunchResult.exitCode,
        signal: postInstallLaunchResult.signal,
        timedOut: postInstallLaunchResult.timedOut,
        stderr: postInstallLaunchResult.stderr.slice(-1600),
        stdout: postInstallLaunchResult.stdout.slice(-1600),
      })}`);
    }
    checks.push('post-update-installed-app-launch-smoke');

    const postInstallPayload = parsePackagedLaunchPayload(postInstallLaunchResult.stdout);
    const postInstallVersion = postInstallPayload?.health?.version ?? null;
    if (postInstallVersion !== latestMetadata.version) {
      throw new Error(`post-update installed app version mismatch: expected ${latestMetadata.version}, got ${postInstallVersion ?? 'null'}`);
    }
    checks.push('post-update-installed-app-version');

    uninstallResult = await cleanupInstalledApp(installDir);
    if (uninstallResult.exitCode !== 0 || uninstallResult.timedOut) {
      throw new Error(`cleanup failed: ${JSON.stringify({
        exitCode: uninstallResult.exitCode,
        signal: uninstallResult.signal,
        timedOut: uninstallResult.timedOut,
        stderr: uninstallResult.stderr.slice(-1200),
      })}`);
    }
    checks.push('installed-app-cleanup');

    const successPayload = {
      ok: true,
      latestReleaseTag: latestRelease?.tag_name,
      latestVersion: latestMetadata?.version,
      baselineVersion,
      referencedInstallerName: channelResult?.referencedInstallerName,
      baselineInstallerName,
      baselinePackageName,
      baselinePackageType,
      publishedFeedMode,
      installMode: explicitInstallDir ? 'custom-dir' : 'isolated-short-dir',
      checks,
      statusSummary,
      installResult,
      updateLaunchResult,
      postInstallLaunchResult,
      uninstallResult,
    };
    await writeArtifact('passed', successPayload);
    console.log(JSON.stringify(buildArtifactPayload(successPayload), null, 2));
  } catch {
    failurePayload = {
      ok: false,
      code: 'windows-updater-published-install-smoke-failed',
      latestReleaseTag: latestRelease?.tag_name,
      latestVersion: latestMetadata?.version,
      baselineVersion,
      referencedInstallerName: channelResult?.referencedInstallerName,
      baselineInstallerName,
      baselinePackageName,
      baselinePackageType,
      publishedFeedMode,
      installMode: explicitInstallDir ? 'custom-dir' : 'isolated-short-dir',
      checks,
      blockers: channelResult?.blockers ?? statusSummary?.blockers ?? [],
      statusSummary,
      installResult,
      updateLaunchResult,
      postInstallLaunchResult,
      uninstallResult,
    };
  } finally {
    try {
      uninstallResult = await cleanupInstalledApp(installDir);
    } catch {
      // Nothing to uninstall.
    }
    await fs.rm(smokeRoot, { recursive: true, force: true }).catch(() => null);
  }

  if (failurePayload) {
    failurePayload.uninstallResult = uninstallResult;
    await writeArtifact('failed', failurePayload);
    console.error(JSON.stringify(buildArtifactPayload(failurePayload), null, 2));
    process.exit(1);
  }
};

main();
