import { describe, expect, it } from 'vitest';
import {
  buildWindowsUpdaterInstallArgs,
  buildWindowsUpdaterSafeInstallerPath,
  buildUpdaterSmokeStatusEvent,
  readUpdaterSmokeConfig,
  sanitizeUpdaterDownloadedFileName,
} from '../../../electron/updater-smoke';

describe('Electron updater smoke helpers', () => {
  it('reads the local feed smoke configuration from env', () => {
    expect(readUpdaterSmokeConfig({
      CODEXMUX_ELECTRON_UPDATER_FEED_URL: 'http://127.0.0.1:8123/',
      CODEXMUX_ELECTRON_UPDATER_SMOKE: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_STATUS_PATH: 'C:\\tmp\\status.jsonl',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_DOWNLOAD: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_AUTO_INSTALL: '1',
      CODEXMUX_ELECTRON_UPDATER_SMOKE_INSTALL_DIR: 'C:\\tmp\\codexmux',
      CODEXMUX_ELECTRON_UPDATER_DISABLE_DIFFERENTIAL: '1',
    })).toEqual({
      enabled: true,
      feedUrl: 'http://127.0.0.1:8123/',
      statusPath: 'C:\\tmp\\status.jsonl',
      autoDownload: true,
      autoInstall: true,
      installDir: 'C:\\tmp\\codexmux',
      disableDifferentialDownload: true,
    });
  });

  it('ignores smoke config when the smoke flag is not enabled', () => {
    expect(readUpdaterSmokeConfig({
      CODEXMUX_ELECTRON_UPDATER_FEED_URL: 'http://127.0.0.1:8123/',
    })).toEqual({
      enabled: false,
      feedUrl: null,
      statusPath: null,
      autoDownload: false,
      autoInstall: false,
      installDir: null,
      disableDifferentialDownload: false,
    });
  });

  it('keeps updater status events path-light', () => {
    expect(sanitizeUpdaterDownloadedFileName('C:\\Users\\me\\AppData\\Local\\codexmux-updater\\pending\\codexmux.exe'))
      .toBe('codexmux.exe');

    expect(buildUpdaterSmokeStatusEvent('update-downloaded', {
      version: '0.4.3',
      downloadedFile: 'C:\\Users\\me\\AppData\\Local\\codexmux-updater\\pending\\codexmux.exe',
    })).toMatchObject({
      event: 'update-downloaded',
      version: '0.4.3',
      downloadedFileName: 'codexmux.exe',
    });
  });

  it('builds Windows NSIS updater install args for copied installers', () => {
    expect(buildWindowsUpdaterInstallArgs({
      isSilent: true,
      isForceRunAfter: false,
      installDir: null,
    })).toEqual(['--updated', '/S']);

    expect(buildWindowsUpdaterInstallArgs({
      isSilent: false,
      isForceRunAfter: true,
      installDir: 'C:\\apps\\codexmux',
    })).toEqual(['--updated', '--force-run', '/D=C:\\apps\\codexmux']);
  });

  it('builds a safe updater installer copy path outside the updater pending cache', () => {
    expect(buildWindowsUpdaterSafeInstallerPath({
      downloadedFile: 'C:\\Users\\me\\AppData\\Local\\codexmux-updater\\pending\\codexmux-Setup-0.4.3.exe',
      tempDir: 'C:\\Users\\me\\AppData\\Local\\Temp',
      nonce: 'abc123',
    })).toBe('C:\\Users\\me\\AppData\\Local\\Temp\\codexmux-update-abc123\\codexmux-Setup-0.4.3.exe');
  });
});
