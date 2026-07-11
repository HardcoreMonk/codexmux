import {
  initAuthCredentials,
  type TAuthBootstrapState,
} from '@/lib/auth-credentials';
import { initializeBootstrapRuntimeState } from '@/lib/bootstrap-state';
import { initConfigStore, type IConfigData } from '@/lib/config-store';
import { initAccessFilter, type IInitAccessFilterOptions } from '@/lib/access-filter';
import { initShellPath } from '@/lib/preflight';
import type { TNetworkAccess } from '@/lib/network-access';

export interface IServerBootstrapDependencies {
  initConfigStore: () => Promise<IConfigData>;
  initShellPath: () => Promise<void>;
  initAuthCredentials: (config: IConfigData) => Promise<TAuthBootstrapState>;
  applyAuthBootstrapEnv: (state: TAuthBootstrapState) => void;
  initializeBootstrapRuntimeState: (mode: TAuthBootstrapState['mode']) => void;
  initAccessFilter: (options: IInitAccessFilterOptions) => void;
  isDetectablyElevated: () => boolean;
}

export interface IServerBootstrapNetworkMetadata {
  envHost: string | undefined;
  networkAccess: TNetworkAccess | undefined;
  setupRestrictedAtStartup: boolean;
}

export interface IServerBootstrapResult {
  authBootstrap: TAuthBootstrapState;
  network: IServerBootstrapNetworkMetadata;
}

export const applyAuthBootstrapEnv = (state: TAuthBootstrapState): void => {
  delete process.env.AUTH_PASSWORD;
  delete process.env.NEXTAUTH_SECRET;
  if (state.mode === 'setup-open') return;

  process.env.AUTH_PASSWORD = state.passwordHash;
  process.env.NEXTAUTH_SECRET = state.secret;
};

const isDetectablyElevated = (): boolean => process.getuid?.() === 0;

const defaultDependencies: IServerBootstrapDependencies = {
  initConfigStore,
  initShellPath,
  initAuthCredentials,
  applyAuthBootstrapEnv,
  initializeBootstrapRuntimeState,
  initAccessFilter,
  isDetectablyElevated,
};

export const initializeServerBootstrap = async (
  dependencies: Partial<IServerBootstrapDependencies> = {},
): Promise<IServerBootstrapResult> => {
  const deps = { ...defaultDependencies, ...dependencies };
  const [configData] = await Promise.all([
    deps.initConfigStore(),
    deps.initShellPath(),
  ]);
  const authBootstrap = await deps.initAuthCredentials(configData);

  if (authBootstrap.mode === 'setup-open' && deps.isDetectablyElevated()) {
    throw new Error('INIT_PASSWORD is required for elevated setup');
  }

  const envHost = process.env.HOST?.trim() || undefined;
  const setupRestrictedAtStartup = authBootstrap.mode !== 'configured';

  deps.applyAuthBootstrapEnv(authBootstrap);
  deps.initializeBootstrapRuntimeState(authBootstrap.mode);
  deps.initAccessFilter({
    envHost,
    networkAccess: configData.networkAccess,
    setupRequiredAtStartup: setupRestrictedAtStartup,
  });

  return {
    authBootstrap,
    network: {
      envHost,
      networkAccess: configData.networkAccess,
      setupRestrictedAtStartup,
    },
  };
};
