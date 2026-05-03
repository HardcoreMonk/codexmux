const safeUrl = (raw) => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

export const normalizeElectronSmokeUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value) throw new Error('Electron smoke URL is required');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withScheme);
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

export const buildElectronSmokeArgs = ({ remoteDebuggingPort, appPath = '.' }) => [
  `--remote-debugging-port=${remoteDebuggingPort}`,
  '--disable-gpu',
  '--no-sandbox',
  appPath,
];

const hasDevtoolsUrl = (target) =>
  typeof target?.webSocketDebuggerUrl === 'string' && target.webSocketDebuggerUrl.length > 0;

export const selectElectronPageTarget = (targets, expectedUrl) => {
  const expected = safeUrl(normalizeElectronSmokeUrl(expectedUrl));
  const candidates = targets.filter((target) => target?.type === 'page' && hasDevtoolsUrl(target));
  if (candidates.length === 0) return null;

  const exact = candidates.find((target) => safeUrl(target.url)?.origin === expected?.origin);
  return exact ?? candidates[0];
};
