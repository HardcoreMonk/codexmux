import path from 'path';

const windowsJoin = (...parts) => path.win32.join(...parts);

const requiredInstallEvents = [
  {
    event: 'configured',
    check: 'updater-local-feed-configured',
    blocker: 'updater-local-feed-configured-missing',
  },
  {
    event: 'checking-for-update',
    check: 'updater-check-started',
    blocker: 'updater-check-started-missing',
  },
  {
    event: 'update-available',
    check: 'updater-update-available',
    blocker: 'updater-update-available-missing',
  },
  {
    event: 'download-started',
    check: 'updater-download-started',
    blocker: 'updater-download-started-missing',
  },
  {
    event: 'download-progress',
    check: 'updater-download-progress',
    blocker: null,
  },
  {
    event: 'update-downloaded',
    check: 'updater-update-downloaded',
    blocker: 'updater-update-downloaded-missing',
  },
  {
    event: 'quit-and-install-started',
    check: 'updater-quit-and-install-started',
    blocker: 'updater-quit-and-install-started-missing',
  },
];

export const bumpPatchVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!match) throw new Error('A valid x.y.z version is required for updater local feed smoke.');
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
};

export const buildWindowsUpdaterLocalFeedLatestMetadata = ({
  latestMetadata,
  nextVersion,
  releaseDate = new Date().toISOString(),
}) => ({
  ...latestMetadata,
  version: nextVersion,
  files: Array.isArray(latestMetadata?.files)
    ? latestMetadata.files.map((file) => ({ ...file }))
    : latestMetadata?.files,
  releaseDate,
});

export const buildWindowsUpdaterSmokeEnv = ({
  env = process.env,
  feedUrl,
  statusPath,
  installDir,
  homeDir,
  useRealLocalAppData = false,
}) => {
  const smokeEnv = {
    ...env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    APPDATA: windowsJoin(homeDir, 'AppData', 'Roaming'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_AT_BRIDGE: '1',
    CODEXMUX_RUNTIME_V2: '1',
    CODEXMUX_RUNTIME_TERMINAL_V2_MODE: 'new-tabs',
    CODEXMUX_RUNTIME_TERMINAL_ADAPTER: 'windows',
    CODEXMUX_PROCESS_INSPECTOR_ADAPTER: 'windows',
    CODEXMUX_ELECTRON_UPDATER_SMOKE: '1',
    CODEXMUX_ELECTRON_UPDATER_SMOKE_STATUS_PATH: statusPath,
    CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_DOWNLOAD: '1',
    CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_INSTALL: '1',
    CODEXMUX_ELECTRON_UPDATER_DISABLE_DIFFERENTIAL: '1',
  };

  if (!useRealLocalAppData) {
    smokeEnv.LOCALAPPDATA = windowsJoin(homeDir, 'AppData', 'Local');
  }

  if (typeof installDir === 'string' && installDir.trim()) {
    smokeEnv.CODEXMUX_ELECTRON_UPDATER_SMOKE_INSTALL_DIR = installDir;
  }

  delete smokeEnv.CODEXMUX_ELECTRON_UPDATER_FEED_URL;
  if (typeof feedUrl === 'string' && feedUrl.trim()) {
    smokeEnv.CODEXMUX_ELECTRON_UPDATER_FEED_URL = feedUrl;
  }

  return smokeEnv;
};

export const parseWindowsUpdaterStatusEvents = (content) =>
  String(content || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const addBlocker = (blockers, ruleId, message) => {
  blockers.push({ ruleId, message });
};

export const summarizeWindowsUpdaterStatusEvents = (events, { requireConfigured = true } = {}) => {
  const list = Array.isArray(events) ? events : [];
  const eventNames = new Set(list.map((event) => event?.event));
  const checks = [];
  const blockers = [];

  for (const requirement of requiredInstallEvents) {
    if (requirement.event === 'configured' && !requireConfigured) continue;
    if (eventNames.has(requirement.event)) {
      checks.push(requirement.check);
    } else if (requirement.blocker) {
      addBlocker(
        blockers,
        requirement.blocker,
        `Updater local feed smoke did not observe ${requirement.event}.`,
      );
    }
  }

  const errorEvent = list.find((event) => event?.event === 'error');
  if (errorEvent) {
    addBlocker(
      blockers,
      'updater-error-event',
      errorEvent.error || 'Updater emitted an error event.',
    );
  }

  const updateAvailable = list.find((event) => event?.event === 'update-available');
  const downloaded = list.find((event) => event?.event === 'update-downloaded');

  return {
    ok: blockers.length === 0,
    latestVersion: downloaded?.version ?? updateAvailable?.version ?? null,
    downloadedFileName: downloaded?.downloadedFileName ?? null,
    checks,
    blockers,
  };
};

const normalizeNeedle = (value) =>
  String(value || '').replace(/\//g, '\\').toLowerCase();

const isUpdaterInstallerProcessName = (name) =>
  /^codexmux-Setup-.+\.exe$/i.test(String(name || ''))
  || String(name || '').toLowerCase() === 'old-uninstaller.exe';

export const filterWindowsUpdaterInstallerProcesses = ({
  processes,
  smokeRoot,
  installDir,
  includeUnscopedInstallers = false,
} = {}) => {
  const needles = [smokeRoot, installDir]
    .map(normalizeNeedle)
    .filter(Boolean);

  return (Array.isArray(processes) ? processes : [])
    .map((processInfo) => ({
      processId: Number(processInfo?.processId ?? processInfo?.ProcessId),
      name: processInfo?.name ?? processInfo?.Name ?? null,
      commandLine: processInfo?.commandLine ?? processInfo?.CommandLine ?? '',
    }))
    .filter((processInfo) => Number.isSafeInteger(processInfo.processId))
    .filter((processInfo) => isUpdaterInstallerProcessName(processInfo.name))
    .filter((processInfo) => {
      if (includeUnscopedInstallers && needles.length === 0) return true;
      const commandLine = normalizeNeedle(processInfo.commandLine);
      return needles.some((needle) => commandLine.includes(needle));
    });
};

const summarizeCommandResult = (result) => {
  if (!result) return null;
  return {
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    timedOut: !!result.timedOut,
  };
};

export const buildWindowsUpdaterLocalFeedArtifactPayload = ({
  ok,
  checks,
  blockers = [],
  statusSummary,
  installResult,
  updateLaunchResult,
  postInstallLaunchResult,
  uninstallResult,
}) => ({
  ok: ok === true,
  mutatesSystem: true,
  checks: Array.isArray(checks) ? checks : [],
  blockers: Array.isArray(blockers) ? blockers : [],
  latestVersion: statusSummary?.latestVersion ?? null,
  downloadedFileName: statusSummary?.downloadedFileName ?? null,
  installResult: summarizeCommandResult(installResult),
  updateLaunchResult: summarizeCommandResult(updateLaunchResult),
  postInstallLaunchResult: summarizeCommandResult(postInstallLaunchResult),
  uninstallResult: summarizeCommandResult(uninstallResult),
});
