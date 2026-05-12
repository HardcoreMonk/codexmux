import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-updater-local-feed-smoke-lib.mjs')).href);

describe('Windows updater local feed smoke helpers', () => {
  it('bumps the patch version for a synthetic local feed update', async () => {
    const { bumpPatchVersion } = await loadLib();

    expect(bumpPatchVersion('0.4.2')).toBe('0.4.3');
    expect(bumpPatchVersion('10.20.30')).toBe('10.20.31');
    expect(() => bumpPatchVersion('not-semver')).toThrow('valid x.y.z version');
  });

  it('builds latest.yml metadata for a local feed without changing installer checksums', async () => {
    const { buildWindowsUpdaterLocalFeedLatestMetadata } = await loadLib();

    const latest = buildWindowsUpdaterLocalFeedLatestMetadata({
      latestMetadata: {
        version: '0.4.2',
        files: [
          {
            url: 'codexmux-Setup-0.4.2.exe',
            sha512: 'installer-sha',
            size: 123,
          },
        ],
        path: 'codexmux-Setup-0.4.2.exe',
        sha512: 'installer-sha',
        releaseDate: '2026-05-06T17:00:33.564Z',
      },
      nextVersion: '0.4.3',
      releaseDate: '2026-05-07T00:00:00.000Z',
    });

    expect(latest).toEqual({
      version: '0.4.3',
      files: [
        {
          url: 'codexmux-Setup-0.4.2.exe',
          sha512: 'installer-sha',
          size: 123,
        },
      ],
      path: 'codexmux-Setup-0.4.2.exe',
      sha512: 'installer-sha',
      releaseDate: '2026-05-07T00:00:00.000Z',
    });
  });

  it('builds the packaged app updater smoke environment', async () => {
    const { buildWindowsUpdaterSmokeEnv } = await loadLib();

    const env = buildWindowsUpdaterSmokeEnv({
      env: { PATH: 'C:\\Windows' },
      feedUrl: 'http://127.0.0.1:8123/',
      statusPath: 'C:\\tmp\\updater-status.jsonl',
      installDir: 'C:\\tmp\\codexmux-app',
      homeDir: 'C:\\tmp\\codexmux-home',
    });

    expect(env).toMatchObject({
      PATH: 'C:\\Windows',
      HOME: 'C:\\tmp\\codexmux-home',
      USERPROFILE: 'C:\\tmp\\codexmux-home',
      APPDATA: 'C:\\tmp\\codexmux-home\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\tmp\\codexmux-home\\AppData\\Local',
      CODEXMUX_ELECTRON_UPDATER_FEED_URL: 'http://127.0.0.1:8123/',
      CODEXMUX_ELECTRON_UPDATER_SMOKE: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_STATUS_PATH: 'C:\\tmp\\updater-status.jsonl',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_DOWNLOAD: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_INSTALL: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_INSTALL_DIR: 'C:\\tmp\\codexmux-app',
      CODEXMUX_ELECTRON_UPDATER_DISABLE_DIFFERENTIAL: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    });
  });

  it('does not override the updater install directory for default-path update smoke', async () => {
    const { buildWindowsUpdaterSmokeEnv } = await loadLib();

    const env = buildWindowsUpdaterSmokeEnv({
      env: { PATH: 'C:\\Windows' },
      feedUrl: 'http://127.0.0.1:8123/',
      statusPath: 'C:\\tmp\\updater-status.jsonl',
      installDir: null,
      homeDir: 'C:\\tmp\\codexmux-home',
    });

    expect(env).not.toHaveProperty('CODEXMUX_ELECTRON_UPDATER_SMOKE_INSTALL_DIR');
  });

  it('can preserve the real LOCALAPPDATA for default-path updater cache behavior', async () => {
    const { buildWindowsUpdaterSmokeEnv } = await loadLib();

    const env = buildWindowsUpdaterSmokeEnv({
      env: {
        PATH: 'C:\\Windows',
        LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      },
      feedUrl: 'http://127.0.0.1:8123/',
      statusPath: 'C:\\tmp\\updater-status.jsonl',
      installDir: null,
      homeDir: 'C:\\tmp\\codexmux-home',
      useRealLocalAppData: true,
    });

    expect(env.LOCALAPPDATA).toBe('C:\\Users\\me\\AppData\\Local');
    expect(env.APPDATA).toBe('C:\\tmp\\codexmux-home\\AppData\\Roaming');
  });

  it('omits the local feed override when using the packaged GitHub updater channel', async () => {
    const { buildWindowsUpdaterSmokeEnv } = await loadLib();

    const env = buildWindowsUpdaterSmokeEnv({
      env: {
        PATH: 'C:\\Windows',
        CODEXMUX_ELECTRON_UPDATER_FEED_URL: 'http://127.0.0.1:8123/',
      },
      feedUrl: null,
      statusPath: 'C:\\tmp\\updater-status.jsonl',
      installDir: 'C:\\tmp\\codexmux-app',
      homeDir: 'C:\\tmp\\codexmux-home',
    });

    expect(env).not.toHaveProperty('CODEXMUX_ELECTRON_UPDATER_FEED_URL');
    expect(env).toMatchObject({
      CODEXMUX_ELECTRON_UPDATER_SMOKE: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_DOWNLOAD: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_INSTALL: '1',
    });
  });

  it('summarizes updater status events into checks', async () => {
    const { summarizeWindowsUpdaterStatusEvents } = await loadLib();

    const summary = summarizeWindowsUpdaterStatusEvents([
      { event: 'configured', feedProvider: 'generic' },
      { event: 'checking-for-update' },
      { event: 'update-available', version: '0.4.3' },
      { event: 'download-started', version: '0.4.3' },
      { event: 'download-progress', percent: 100 },
      { event: 'update-downloaded', version: '0.4.3', downloadedFileName: 'codexmux-Setup-0.4.2.exe' },
      { event: 'quit-and-install-started', version: '0.4.3' },
    ]);

    expect(summary).toEqual({
      ok: true,
      latestVersion: '0.4.3',
      downloadedFileName: 'codexmux-Setup-0.4.2.exe',
      checks: [
        'updater-local-feed-configured',
        'updater-check-started',
        'updater-update-available',
        'updater-download-started',
        'updater-download-progress',
        'updater-update-downloaded',
        'updater-quit-and-install-started',
      ],
      blockers: [],
    });
  });

  it('does not require the local feed configured event for the published GitHub updater channel', async () => {
    const { summarizeWindowsUpdaterStatusEvents } = await loadLib();

    const summary = summarizeWindowsUpdaterStatusEvents([
      { event: 'checking-for-update' },
      { event: 'update-available', version: '0.4.8' },
      { event: 'download-started', version: '0.4.8' },
      { event: 'download-progress', percent: 100 },
      { event: 'update-downloaded', version: '0.4.8', downloadedFileName: 'codexmux-Setup-0.4.8.exe' },
      { event: 'quit-and-install-started', version: '0.4.8' },
    ], { requireConfigured: false });

    expect(summary).toEqual({
      ok: true,
      latestVersion: '0.4.8',
      downloadedFileName: 'codexmux-Setup-0.4.8.exe',
      checks: [
        'updater-check-started',
        'updater-update-available',
        'updater-download-started',
        'updater-download-progress',
        'updater-update-downloaded',
        'updater-quit-and-install-started',
      ],
      blockers: [],
    });
  });

  it('reports missing updater install events as blockers', async () => {
    const { summarizeWindowsUpdaterStatusEvents } = await loadLib();

    const summary = summarizeWindowsUpdaterStatusEvents([
      { event: 'configured', feedProvider: 'generic' },
      { event: 'checking-for-update' },
      { event: 'update-available', version: '0.4.3' },
    ]);

    expect(summary.ok).toBe(false);
    expect(summary.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toEqual([
      'updater-download-started-missing',
      'updater-update-downloaded-missing',
      'updater-quit-and-install-started-missing',
    ]);
  });

  it('filters updater installer processes to the current smoke install root', async () => {
    const { filterWindowsUpdaterInstallerProcesses } = await loadLib();

    const processes = filterWindowsUpdaterInstallerProcesses({
      smokeRoot: 'C:\\Temp\\codexmux-updater-local-feed-smoke-abc',
      installDir: 'C:\\Temp\\codexmux-updater-local-feed-smoke-abc\\app',
      processes: [
        {
          processId: 10,
          name: 'codexmux-Setup-0.4.3.exe',
          commandLine: 'codexmux-Setup-0.4.3.exe --updated /S /D=C:\\Temp\\codexmux-updater-local-feed-smoke-abc\\app',
        },
        {
          processId: 11,
          name: 'old-uninstaller.exe',
          commandLine: 'old-uninstaller.exe /S _?=C:\\Temp\\codexmux-updater-local-feed-smoke-abc\\app',
        },
        {
          processId: 12,
          name: 'codexmux-Setup-0.4.3.exe',
          commandLine: 'codexmux-Setup-0.4.3.exe --updated /S /D=C:\\Temp\\other\\app',
        },
        {
          processId: 13,
          name: 'pwsh.exe',
          commandLine: 'pwsh -Command Get-CimInstance',
        },
      ],
    });

    expect(processes.map((process: { processId: number }) => process.processId)).toEqual([10, 11]);
  });

  it('can include unscoped updater installer processes for default-path update smoke', async () => {
    const { filterWindowsUpdaterInstallerProcesses } = await loadLib();

    const processes = filterWindowsUpdaterInstallerProcesses({
      smokeRoot: null,
      installDir: null,
      includeUnscopedInstallers: true,
      processes: [
        {
          processId: 10,
          name: 'codexmux-Setup-0.4.3.exe',
          commandLine: 'codexmux-Setup-0.4.3.exe --updated /S',
        },
        {
          processId: 11,
          name: 'old-uninstaller.exe',
          commandLine: 'old-uninstaller.exe /S /KEEP_APP_DATA /currentuser --updated _?=C:\\Users\\me\\AppData\\Local\\Programs\\codexmux',
        },
        {
          processId: 12,
          name: 'pwsh.exe',
          commandLine: 'pwsh -Command Get-CimInstance',
        },
      ],
    });

    expect(processes.map((process: { processId: number }) => process.processId)).toEqual([10, 11]);
  });
});
