import fs from 'fs';
import path from 'path';

const installerNamePattern = /^codexmux(?: Setup |-Setup-)(\d+\.\d+\.\d+)\.exe$/i;
const windowsZipNamePattern = /^codexmux-(\d+\.\d+\.\d+)-win\.zip$/i;

export const getWindowsInstallerVersion = (nameOrPath) =>
  installerNamePattern.exec(path.basename(String(nameOrPath || '')))?.[1] ?? null;

export const getWindowsZipVersion = (nameOrPath) =>
  windowsZipNamePattern.exec(path.basename(String(nameOrPath || '')))?.[1] ?? null;

const parseSemver = (version) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
};

const compareSemver = (left, right) => {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
};

const collectWindowsInstallers = (releaseDir) => {
  const entries = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir, { withFileTypes: true })
    : [];

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const version = getWindowsInstallerVersion(entry.name);
      if (!version) return null;
      const fullPath = path.join(releaseDir, entry.name);
      return {
        path: fullPath,
        version,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      };
    })
    .filter(Boolean);
};

const collectWindowsZips = (releaseDir) => {
  const entries = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir, { withFileTypes: true })
    : [];

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const version = getWindowsZipVersion(entry.name);
      if (!version) return null;
      const fullPath = path.join(releaseDir, entry.name);
      return {
        path: fullPath,
        version,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      };
    })
    .filter(Boolean);
};

export const getWindowsDefaultPerUserInstallDir = (env = process.env) => {
  const localAppData = env.LOCALAPPDATA
    || (env.USERPROFILE ? path.join(env.USERPROFILE, 'AppData', 'Local') : null);
  if (!localAppData) throw new Error('LOCALAPPDATA or USERPROFILE is required to resolve the default Windows install directory');
  return path.join(localAppData, 'Programs', 'codexmux');
};

export const buildNsisSilentInstallArgs = (installDir, { useDefaultInstallDir = false } = {}) => {
  if (useDefaultInstallDir) return ['/S'];
  if (!installDir) throw new Error('installDir is required');
  return ['/S', `/D=${installDir}`];
};

export const buildNsisSilentUninstallArgs = () => ['/S', '/currentuser'];

export const findWindowsInstaller = (releaseDir) => {
  const installers = collectWindowsInstallers(releaseDir)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((installer) => installer.path);

  return installers[0] ?? null;
};

export const findWindowsInstallerBelowVersion = (releaseDir, targetVersion) => {
  if (!parseSemver(targetVersion)) throw new Error('targetVersion must be a valid x.y.z version');

  return collectWindowsInstallers(releaseDir)
    .filter((installer) => compareSemver(installer.version, targetVersion) < 0)
    .sort((a, b) => {
      const versionComparison = compareSemver(b.version, a.version);
      if (versionComparison !== 0) return versionComparison;
      return b.mtimeMs - a.mtimeMs;
    })[0]?.path ?? null;
};

export const findWindowsZipBelowVersion = (releaseDir, targetVersion) => {
  if (!parseSemver(targetVersion)) throw new Error('targetVersion must be a valid x.y.z version');

  return collectWindowsZips(releaseDir)
    .filter((zip) => compareSemver(zip.version, targetVersion) < 0)
    .sort((a, b) => {
      const versionComparison = compareSemver(b.version, a.version);
      if (versionComparison !== 0) return versionComparison;
      return b.mtimeMs - a.mtimeMs;
    })[0]?.path ?? null;
};

export const resolveInstalledAppPaths = (installDir) => ({
  appExe: path.join(installDir, 'codexmux.exe'),
  appAsar: path.join(installDir, 'resources', 'app.asar'),
  uninstaller: path.join(installDir, 'Uninstall codexmux.exe'),
});
