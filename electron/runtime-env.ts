import { pathToFileURL } from 'url';

export type TElectronEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export interface IElectronBootstrapEnvInput {
  platform?: NodeJS.Platform;
  env?: TElectronEnv;
}

export interface IPackagedNodePathInput {
  platform?: NodeJS.Platform;
  standaloneModules: string;
  existingNodePath?: string;
}

const posixLaunchPathAdditions = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

const pathDelimiterForPlatform = (platform: NodeJS.Platform): string =>
  platform === 'win32' ? ';' : ':';

const prependMissingPathEntries = (
  currentPath: string | undefined,
  additions: string[],
  delimiter: string,
): string => {
  const parts = (currentPath || '').split(delimiter).filter(Boolean);
  for (const dir of additions) {
    if (!parts.includes(dir)) parts.unshift(dir);
  }
  return parts.join(delimiter);
};

export const buildElectronBootstrapEnv = ({
  platform = process.platform,
  env = process.env,
}: IElectronBootstrapEnvInput = {}): Record<string, string | undefined> => {
  const nextEnv: Record<string, string | undefined> = { ...env };

  if (platform === 'win32') {
    return nextEnv;
  }

  nextEnv.PATH = prependMissingPathEntries(
    nextEnv.PATH,
    posixLaunchPathAdditions,
    pathDelimiterForPlatform(platform),
  );
  if (!nextEnv.LANG) nextEnv.LANG = 'en_US.UTF-8';
  return nextEnv;
};

export const applyElectronBootstrapEnv = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): void => {
  const nextEnv = buildElectronBootstrapEnv({ platform, env });
  for (const [key, value] of Object.entries(nextEnv)) {
    if (value !== undefined) env[key] = value;
  }
};

export const buildPackagedNodePath = ({
  platform = process.platform,
  standaloneModules,
  existingNodePath,
}: IPackagedNodePathInput): string =>
  [standaloneModules, existingNodePath]
    .filter((value): value is string => !!value)
    .join(pathDelimiterForPlatform(platform));

const isWindowsAbsolutePath = (filePath: string): boolean =>
  /^[a-zA-Z]:[\\/]/.test(filePath);

export const buildFileImportSpecifier = (filePath: string): string => {
  if (isWindowsAbsolutePath(filePath)) {
    const url = new URL('file:///');
    url.pathname = `/${filePath.replace(/\\/g, '/')}`;
    return url.href;
  }

  return pathToFileURL(filePath).href;
};
