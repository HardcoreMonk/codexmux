import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BOOTSTRAP_KEYS = [
  '__CMUX_BOOTSTRAP_STARTED_IN_SETUP',
  '__CMUX_BOOTSTRAP_CLAIM_PENDING',
  '__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED',
] as const;

const clearBootstrapEnv = () => {
  for (const key of BOOTSTRAP_KEYS) delete process.env[key];
};

beforeEach(() => {
  clearBootstrapEnv();
  vi.resetModules();
});

afterEach(() => {
  clearBootstrapEnv();
  vi.resetModules();
});

describe('bootstrap runtime state', () => {
  it.each([
    [
      'setup-open',
      { startedInSetup: true, claimPending: true, initSessionRequired: false },
    ],
    [
      'init-password',
      { startedInSetup: true, claimPending: true, initSessionRequired: true },
    ],
    [
      'configured',
      { startedInSetup: false, claimPending: false, initSessionRequired: false },
    ],
  ] as const)('initializes %s without storing credentials', async (mode, expected) => {
    const { initializeBootstrapRuntimeState, getBootstrapRuntimeState } =
      await import('@/lib/bootstrap-state');

    initializeBootstrapRuntimeState(mode);

    expect(getBootstrapRuntimeState()).toEqual(expected);
    expect(JSON.stringify(process.env)).not.toContain('passwordHash');
  });

  it('overwrites inherited internal state on every initialization', async () => {
    for (const key of BOOTSTRAP_KEYS) process.env[key] = 'attacker-controlled';
    const { initializeBootstrapRuntimeState, getBootstrapRuntimeState } =
      await import('@/lib/bootstrap-state');

    initializeBootstrapRuntimeState('setup-open');

    expect(getBootstrapRuntimeState()).toEqual({
      startedInSetup: true,
      claimPending: true,
      initSessionRequired: false,
    });
  });

  it('closes the claim latch one way and idempotently', async () => {
    const {
      initializeBootstrapRuntimeState,
      getBootstrapRuntimeState,
      markBootstrapClaimed,
    } = await import('@/lib/bootstrap-state');
    initializeBootstrapRuntimeState('setup-open');

    markBootstrapClaimed();
    markBootstrapClaimed();

    expect(getBootstrapRuntimeState()).toEqual({
      startedInSetup: true,
      claimPending: false,
      initSessionRequired: false,
    });
  });

  it('fails closed when internal state is missing or malformed', async () => {
    const { getBootstrapRuntimeState, markBootstrapClaimed } = await import('@/lib/bootstrap-state');

    expect(() => getBootstrapRuntimeState()).toThrow();
    expect(() => markBootstrapClaimed()).toThrow();

    process.env.__CMUX_BOOTSTRAP_STARTED_IN_SETUP = '1';
    process.env.__CMUX_BOOTSTRAP_CLAIM_PENDING = 'maybe';
    process.env.__CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED = '0';
    expect(() => getBootstrapRuntimeState()).toThrow();
  });
});
