import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAuthBootstrapEnv,
  initializeServerBootstrap,
  type IServerBootstrapDependencies,
} from '@/lib/server-bootstrap';
import type { IConfigData } from '@/lib/config-store';
import type { TAuthBootstrapState } from '@/lib/auth-credentials';

const config = (updates: Partial<IConfigData> = {}): IConfigData => ({
  updatedAt: '2026-07-11T00:00:00.000Z',
  ...updates,
});

const dependencies = () => ({
  initConfigStore: vi.fn(async () => config()),
  initShellPath: vi.fn(async (): Promise<void> => undefined),
  initAuthCredentials: vi.fn(async (): Promise<TAuthBootstrapState> => ({ mode: 'setup-open' })),
  applyAuthBootstrapEnv: vi.fn(),
  initializeBootstrapRuntimeState: vi.fn(),
  initAccessFilter: vi.fn(),
  isDetectablyElevated: vi.fn(() => false),
}) satisfies IServerBootstrapDependencies;

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

beforeEach(() => {
  delete process.env.AUTH_PASSWORD;
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.HOST;
  delete process.env.__CMUX_BOOTSTRAP_STARTED_IN_SETUP;
  delete process.env.__CMUX_BOOTSTRAP_CLAIM_PENDING;
  delete process.env.__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED;
});

describe('server bootstrap composition', () => {
  it('waits for config and shell path before composing auth', async () => {
    let resolveConfig!: (value: IConfigData) => void;
    let resolveShell!: () => void;
    const configReady = new Promise<IConfigData>((resolve) => { resolveConfig = resolve; });
    const shellReady = new Promise<void>((resolve) => { resolveShell = resolve; });
    const deps = dependencies();
    deps.initConfigStore.mockReturnValue(configReady);
    deps.initShellPath.mockReturnValue(shellReady);

    const initializing = initializeServerBootstrap(deps);
    expect(deps.initConfigStore).toHaveBeenCalledTimes(1);
    expect(deps.initShellPath).toHaveBeenCalledTimes(1);

    const initializedConfig = config({ networkAccess: 'tailscale' });
    resolveConfig(initializedConfig);
    await flush();
    expect(deps.initAuthCredentials).not.toHaveBeenCalled();

    resolveShell();
    await initializing;
    expect(deps.initAuthCredentials).toHaveBeenCalledWith(initializedConfig);
  });

  it.each([
    [{ mode: 'configured', passwordHash: 'configured-hash', secret: 'configured-secret' } as const, false],
    [{ mode: 'init-password', passwordHash: 'init-hash', secret: 'init-secret' } as const, true],
    [{ mode: 'setup-open' } as const, true],
  ])('applies %s auth, latch, and access in order', async (authBootstrap, setupRequiredAtStartup) => {
    const calls: string[] = [];
    const deps = dependencies();
    deps.initConfigStore.mockResolvedValue(config({ networkAccess: 'all' }));
    deps.initAuthCredentials.mockResolvedValue(authBootstrap);
    deps.applyAuthBootstrapEnv.mockImplementation(() => { calls.push('env'); });
    deps.initializeBootstrapRuntimeState.mockImplementation(() => { calls.push('latch'); });
    deps.initAccessFilter.mockImplementation(() => { calls.push('access'); });
    process.env.HOST = '0.0.0.0';

    const result = await initializeServerBootstrap(deps);

    expect(calls).toEqual(['env', 'latch', 'access']);
    expect(deps.initializeBootstrapRuntimeState).toHaveBeenCalledWith(authBootstrap.mode);
    expect(deps.initAccessFilter).toHaveBeenCalledWith({
      envHost: '0.0.0.0',
      networkAccess: 'all',
      setupRequiredAtStartup,
    });
    expect(result).toEqual({
      authBootstrap,
      network: {
        envHost: '0.0.0.0',
        networkAccess: 'all',
        setupRestrictedAtStartup: setupRequiredAtStartup,
      },
    });
    expect(result).not.toHaveProperty('config');
  });

  it('overwrites inherited auth and bootstrap runtime state on every successful run', async () => {
    process.env.AUTH_PASSWORD = 'stale-password';
    process.env.NEXTAUTH_SECRET = 'stale-secret';
    process.env.__CMUX_BOOTSTRAP_STARTED_IN_SETUP = 'stale';
    process.env.__CMUX_BOOTSTRAP_CLAIM_PENDING = 'stale';
    process.env.__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED = 'stale';
    const deps = dependencies();
    deps.applyAuthBootstrapEnv.mockImplementation(applyAuthBootstrapEnv);
    deps.initializeBootstrapRuntimeState.mockImplementation((mode: TAuthBootstrapState['mode']) => {
      process.env.__CMUX_BOOTSTRAP_STARTED_IN_SETUP = mode === 'configured' ? '0' : '1';
      process.env.__CMUX_BOOTSTRAP_CLAIM_PENDING = mode === 'configured' ? '0' : '1';
      process.env.__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED = mode === 'init-password' ? '1' : '0';
    });

    await initializeServerBootstrap(deps);

    expect(process.env.AUTH_PASSWORD).toBeUndefined();
    expect(process.env.NEXTAUTH_SECRET).toBeUndefined();
    expect(process.env.__CMUX_BOOTSTRAP_STARTED_IN_SETUP).toBe('1');
    expect(process.env.__CMUX_BOOTSTRAP_CLAIM_PENDING).toBe('1');
    expect(process.env.__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED).toBe('0');
  });

  it('refuses elevated setup-open before auth, latch, or access side effects', async () => {
    const deps = dependencies();
    deps.isDetectablyElevated.mockReturnValue(true);

    await expect(initializeServerBootstrap(deps)).rejects.toThrow(
      'INIT_PASSWORD is required for elevated setup',
    );

    expect(deps.applyAuthBootstrapEnv).not.toHaveBeenCalled();
    expect(deps.initializeBootstrapRuntimeState).not.toHaveBeenCalled();
    expect(deps.initAccessFilter).not.toHaveBeenCalled();
  });

  it.each(['malformed stored auth', 'hash-only auth', 'short INIT_PASSWORD']) (
    'does not initialize listener access when auth bootstrap fails: %s',
    async (message) => {
      const deps = dependencies();
      deps.initAuthCredentials.mockRejectedValue(new Error(message));

      await expect(initializeServerBootstrap(deps)).rejects.toThrow(message);

      expect(deps.applyAuthBootstrapEnv).not.toHaveBeenCalled();
      expect(deps.initializeBootstrapRuntimeState).not.toHaveBeenCalled();
      expect(deps.initAccessFilter).not.toHaveBeenCalled();
    },
  );

  it.each(['config', 'shell'] as const)(
    'propagates %s initialization failure without opening the claim latch',
    async (stage) => {
      const deps = dependencies();
      deps[stage === 'config' ? 'initConfigStore' : 'initShellPath'].mockRejectedValue(
        new Error(`${stage} failed`),
      );

      await expect(initializeServerBootstrap(deps)).rejects.toThrow(`${stage} failed`);

      expect(deps.initAuthCredentials).not.toHaveBeenCalled();
      expect(deps.applyAuthBootstrapEnv).not.toHaveBeenCalled();
      expect(deps.initializeBootstrapRuntimeState).not.toHaveBeenCalled();
      expect(deps.initAccessFilter).not.toHaveBeenCalled();
    },
  );

  it('does not initialize access after auth-env or latch dependency errors', async () => {
    for (const stage of ['env', 'latch'] as const) {
      const deps = dependencies();
      if (stage === 'env') {
        deps.applyAuthBootstrapEnv.mockImplementation(() => { throw new Error('env failed'); });
      } else {
        deps.initializeBootstrapRuntimeState.mockImplementation(() => { throw new Error('latch failed'); });
      }

      await expect(initializeServerBootstrap(deps)).rejects.toThrow(`${stage} failed`);
      expect(deps.initAccessFilter).not.toHaveBeenCalled();
    }
  });
});

describe('applyAuthBootstrapEnv', () => {
  it.each([
    [{ mode: 'configured', passwordHash: 'configured-hash', secret: 'configured-secret' } as const],
    [{ mode: 'init-password', passwordHash: 'init-hash', secret: 'init-secret' } as const],
  ])('sets runtime credentials for %s', (state) => {
    applyAuthBootstrapEnv(state);
    expect(process.env.AUTH_PASSWORD).toBe(state.passwordHash);
    expect(process.env.NEXTAUTH_SECRET).toBe(state.secret);
  });

  it('removes inherited runtime credentials for setup-open', () => {
    process.env.AUTH_PASSWORD = 'stale-password';
    process.env.NEXTAUTH_SECRET = 'stale-secret';

    applyAuthBootstrapEnv({ mode: 'setup-open' });

    expect(process.env.AUTH_PASSWORD).toBeUndefined();
    expect(process.env.NEXTAUTH_SECRET).toBeUndefined();
  });
});
