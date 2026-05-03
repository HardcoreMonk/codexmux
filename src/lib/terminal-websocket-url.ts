import { nanoid } from 'nanoid';

export type TTerminalWebSocketEndpoint = '/api/terminal' | '/api/v2/terminal';

export interface ITerminalWebSocketPathInput {
  endpoint: TTerminalWebSocketEndpoint;
  clientId: string;
  sessionName: string;
  cols?: number;
  rows?: number;
}

export interface ITerminalWebSocketLocation {
  protocol: string;
  host: string;
}

export interface ITerminalWebSocketUrlInput extends ITerminalWebSocketPathInput {
  location?: ITerminalWebSocketLocation;
}

interface IClientIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface IGetOrCreateTerminalClientIdOptions {
  storage?: IClientIdStorage;
  createId?: () => string;
}

const CLIENT_ID_PREFIX = 'pt-ws-cid-';

const getBrowserSessionStorage = (): IClientIdStorage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

export const getOrCreateTerminalClientId = (
  sessionName: string,
  options: IGetOrCreateTerminalClientIdOptions = {},
): string => {
  const storage = options.storage ?? getBrowserSessionStorage();
  const createId = options.createId ?? nanoid;
  const key = `${CLIENT_ID_PREFIX}${sessionName}`;
  if (!storage) return createId();
  try {
    const stored = storage.getItem(key);
    if (stored) return stored;
    const id = createId();
    storage.setItem(key, id);
    return id;
  } catch {
    return createId();
  }
};

export const buildTerminalWebSocketPath = ({
  endpoint,
  clientId,
  sessionName,
  cols,
  rows,
}: ITerminalWebSocketPathInput): string => {
  const params = new URLSearchParams();
  params.set('clientId', clientId);
  params.set('session', sessionName);
  if (cols && rows) {
    params.set('cols', String(cols));
    params.set('rows', String(rows));
  }
  return `${endpoint}?${params.toString()}`;
};

export const buildTerminalWebSocketUrl = (input: ITerminalWebSocketUrlInput): string => {
  const locationValue = input.location ?? window.location;
  const baseUrl = `${locationValue.protocol}//${locationValue.host}`;
  const url = new URL(buildTerminalWebSocketPath(input), baseUrl);
  url.protocol = locationValue.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};
