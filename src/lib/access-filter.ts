import {
  DEFAULT_NETWORK_ACCESS,
  isAllowed,
  networkAccessToSpec,
  parseAccessSpec,
} from '@/lib/network-access';
import type { IAccessSpec, TNetworkAccess } from '@/lib/network-access';

const VALID_NETWORK_ACCESS: ReadonlyArray<TNetworkAccess> = ['localhost', 'tailscale', 'all'];

let cachedSpec: IAccessSpec | null = null;
let cachedSource = '';

const resolveSource = (): string => {
  const envHost = process.env.HOST?.trim();
  if (envHost) return envHost;
  const raw = process.env.__CMUX_NETWORK_ACCESS;
  if (raw && (VALID_NETWORK_ACCESS as readonly string[]).includes(raw)) {
    return networkAccessToSpec(raw as TNetworkAccess);
  }
  return networkAccessToSpec(DEFAULT_NETWORK_ACCESS);
};

const getSpec = (): IAccessSpec => {
  const source = resolveSource();
  if (source !== cachedSource || !cachedSpec) {
    cachedSource = source;
    cachedSpec = parseAccessSpec(source);
  }
  return cachedSpec;
};

export const initAccessFilter = (envHost: string | undefined, networkAccess: TNetworkAccess | undefined) => {
  if (!envHost?.trim()) {
    process.env.__CMUX_NETWORK_ACCESS = networkAccess ?? DEFAULT_NETWORK_ACCESS;
  }
  cachedSpec = null;
  cachedSource = '';
};

export const updateAccessFromConfig = (networkAccess: TNetworkAccess) => {
  if (process.env.HOST?.trim()) return;
  process.env.__CMUX_NETWORK_ACCESS = networkAccess;
  cachedSpec = null;
  cachedSource = '';
};

export const isRequestAllowed = (remoteAddress: string | undefined | null): boolean =>
  isAllowed(getSpec(), remoteAddress);

export const getCurrentSpec = (): IAccessSpec => getSpec();

export const isAccessFilterEnvLocked = (): boolean => !!process.env.HOST?.trim();

export const setBoundHost = (host: string) => {
  process.env.__CMUX_BOUND_HOST = host;
};

export const getBoundHost = (): string => process.env.__CMUX_BOUND_HOST ?? '0.0.0.0';

export const isBoundToLocalhostOnly = (): boolean => getBoundHost() === '127.0.0.1';
