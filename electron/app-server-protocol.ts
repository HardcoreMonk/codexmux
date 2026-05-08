export type TAppServerMode = 'local' | 'remote';

export interface IAppServerConfig {
  mode: TAppServerMode;
  remoteUrl?: string;
}

const HAS_URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const isValidPort = (port: number | null | undefined): port is number =>
  typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65_535;

export const normalizeAppServerUrl = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;

  const withScheme = HAS_URL_SCHEME_RE.test(value) ? value : `http://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const normalizeAppServerConfig = (value: unknown): IAppServerConfig => {
  if (!value || typeof value !== 'object') return { mode: 'local' };

  const config = value as Partial<IAppServerConfig>;
  if (config.mode !== 'remote' || typeof config.remoteUrl !== 'string') {
    return { mode: 'local' };
  }

  const remoteUrl = normalizeAppServerUrl(config.remoteUrl);
  return remoteUrl ? { mode: 'remote', remoteUrl } : { mode: 'local' };
};

export const buildLocalAppServerUrl = (port: number): string | null =>
  isValidPort(port) ? `http://localhost:${port}` : null;

export const resolveAppServerUrl = (
  config: IAppServerConfig,
  localPort: number | null,
): string | null => {
  if (config.mode === 'remote') return config.remoteUrl ?? null;
  return isValidPort(localPort) ? buildLocalAppServerUrl(localPort) : null;
};

export const getAppServerLabel = (
  config: IAppServerConfig,
  localPort: number | null,
): string => {
  if (config.mode === 'remote') return config.remoteUrl ?? '';
  return isValidPort(localPort) ? `localhost:${localPort}` : 'localhost';
};
