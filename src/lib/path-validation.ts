import os from 'os';
import path from 'path';

interface IJsonlPathValidationOptions {
  homeDir?: string;
}

const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

const selectPathApi = (filePath: string, rootPath: string): typeof path.win32 | typeof path =>
  WINDOWS_ABSOLUTE_RE.test(filePath) || WINDOWS_ABSOLUTE_RE.test(rootPath)
    ? path.win32
    : path;

const isPathInside = (filePath: string, rootPath: string): boolean => {
  const pathApi = selectPathApi(filePath, rootPath);
  const resolvedFile = pathApi.resolve(filePath);
  const resolvedRoot = pathApi.resolve(rootPath);
  const relative = pathApi.relative(resolvedRoot, resolvedFile);
  return relative.length > 0 && !relative.startsWith('..') && !pathApi.isAbsolute(relative);
};

export const getCodexSessionsDir = (homeDir = os.homedir()): string => {
  const pathApi = WINDOWS_ABSOLUTE_RE.test(homeDir) ? path.win32 : path;
  return pathApi.join(homeDir, '.codex', 'sessions');
};

export const isAllowedJsonlPath = (
  filePath: string,
  options: IJsonlPathValidationOptions = {},
): boolean => {
  const sessionsDir = getCodexSessionsDir(options.homeDir);
  const pathApi = selectPathApi(filePath, sessionsDir);
  return isPathInside(filePath, sessionsDir) && pathApi.extname(filePath) === '.jsonl';
};
