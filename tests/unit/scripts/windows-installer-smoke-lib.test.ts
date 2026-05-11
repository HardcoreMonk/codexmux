import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-installer-smoke-lib.mjs')).href);

describe('Windows installer smoke helpers', () => {
  it('builds silent NSIS install args with the install directory last', async () => {
    const { buildNsisSilentInstallArgs } = await loadLib();

    expect(buildNsisSilentInstallArgs('C:\\temp\\codexmux-install')).toEqual([
      '/S',
      '/D=C:\\temp\\codexmux-install',
    ]);
  });

  it('builds silent NSIS install args without /D when using the default installer path', async () => {
    const { buildNsisSilentInstallArgs } = await loadLib();

    expect(buildNsisSilentInstallArgs('C:\\Users\\me\\AppData\\Local\\Programs\\codexmux', {
      useDefaultInstallDir: true,
    })).toEqual(['/S']);
  });

  it('selects the newest codexmux NSIS installer', async () => {
    const { findWindowsInstaller } = await loadLib();
    const releaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-installer-test-'));
    const older = path.join(releaseDir, 'codexmux Setup 0.4.1.exe');
    const newer = path.join(releaseDir, 'codexmux-Setup-0.4.2.exe');
    await fs.writeFile(older, '');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(newer, '');

    expect(findWindowsInstaller(releaseDir)).toBe(newer);
  });

  it('extracts the installer version from both NSIS artifact name formats', async () => {
    const { getWindowsInstallerVersion } = await loadLib();

    expect(getWindowsInstallerVersion('codexmux-Setup-0.4.3.exe')).toBe('0.4.3');
    expect(getWindowsInstallerVersion('codexmux Setup 0.4.2.exe')).toBe('0.4.2');
    expect(getWindowsInstallerVersion('codexmux-0.4.3-win.zip')).toBeNull();
  });

  it('selects the newest installer below a published update version', async () => {
    const { findWindowsInstallerBelowVersion } = await loadLib();
    const releaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-installer-version-test-'));
    const baseline = path.join(releaseDir, 'codexmux-Setup-0.4.2.exe');
    const published = path.join(releaseDir, 'codexmux-Setup-0.4.3.exe');
    const older = path.join(releaseDir, 'codexmux Setup 0.4.1.exe');
    await fs.writeFile(published, '');
    await fs.writeFile(older, '');
    await fs.writeFile(baseline, '');

    expect(findWindowsInstallerBelowVersion(releaseDir, '0.4.3')).toBe(baseline);
  });

  it('returns null when no installer is below the published update version', async () => {
    const { findWindowsInstallerBelowVersion } = await loadLib();
    const releaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-installer-version-test-'));
    await fs.writeFile(path.join(releaseDir, 'codexmux-Setup-0.4.3.exe'), '');

    expect(findWindowsInstallerBelowVersion(releaseDir, '0.4.3')).toBeNull();
  });

  it('resolves installed app paths from the install directory', async () => {
    const { resolveInstalledAppPaths } = await loadLib();

    expect(resolveInstalledAppPaths('C:\\apps\\codexmux')).toEqual({
      appExe: 'C:\\apps\\codexmux\\codexmux.exe',
      appAsar: 'C:\\apps\\codexmux\\resources\\app.asar',
      uninstaller: 'C:\\apps\\codexmux\\Uninstall codexmux.exe',
    });
  });

  it('resolves the default per-user Windows install directory from LOCALAPPDATA', async () => {
    const { getWindowsDefaultPerUserInstallDir } = await loadLib();

    expect(getWindowsDefaultPerUserInstallDir({
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    })).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\codexmux');
  });

  it('builds silent NSIS uninstall args for the per-user installer contract', async () => {
    const { buildNsisSilentUninstallArgs } = await loadLib();

    expect(buildNsisSilentUninstallArgs()).toEqual(['/S', '/currentuser']);
  });
});
