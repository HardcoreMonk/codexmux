import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInstallRequestAuthorizer,
  createInstallSetupLeaseChecker,
  type IInstallRequestAuthorizerDependencies,
} from '@/lib/install-request-auth';
import { isLoopbackAddress } from '@/lib/network-access';
import type { TStoredAuthState } from '@/lib/config-store';

const request = ({
  host = 'localhost:8122',
  origin = 'http://localhost:8122',
  remoteAddress = '127.0.0.1',
  cookie,
}: {
  host?: string | null;
  origin?: string | null;
  remoteAddress?: string;
  cookie?: string;
} = {}): IncomingMessage => {
  const rawHeaders: string[] = [];
  const headers: IncomingMessage['headers'] = {};
  if (host !== null) {
    rawHeaders.push('Host', host);
    headers.host = host;
  }
  if (origin !== null) {
    rawHeaders.push('Origin', origin);
    headers.origin = origin;
  }
  if (cookie !== undefined) {
    rawHeaders.push('Cookie', cookie);
    headers.cookie = cookie;
  }
  return {
    headers,
    rawHeaders,
    socket: { remoteAddress },
  } as IncomingMessage;
};

const dependencies = () => ({
  readStoredAuthState: vi.fn(async () => ({
    mode: 'setup-required' as const,
    authSecret: null,
  } as TStoredAuthState)),
  getBootstrapState: vi.fn(() => ({
    startedInSetup: true,
    claimPending: true,
    initSessionRequired: false,
  })),
  verifySession: vi.fn(async () => false),
  isLoopbackAddress: vi.fn(isLoopbackAddress),
}) satisfies IInstallRequestAuthorizerDependencies;

describe('install request authorizer', () => {
  let deps: ReturnType<typeof dependencies>;

  beforeEach(() => {
    deps = dependencies();
  });

  it.each(['127.0.0.1', '127.10.20.30', '::1', '::ffff:127.0.0.1']) (
    'admits setup-open from loopback address %s',
    async (remoteAddress) => {
      const authorize = createInstallRequestAuthorizer(deps);

      await expect(authorize(request({ remoteAddress }))).resolves.toEqual({
        authorized: true,
        mode: 'setup-local',
      });
      expect(deps.verifySession).not.toHaveBeenCalled();
    },
  );

  it.each([
    [request({ remoteAddress: '192.168.1.20' }), 'install-local-only'],
    [request({ host: 'workstation.test:8122', origin: 'http://workstation.test:8122' }), 'install-local-only'],
    [request({ origin: null }), 'install-origin-mismatch'],
    [request({ origin: 'http://localhost:8123' }), 'install-origin-mismatch'],
    [request({ host: null }), 'invalid-install-request'],
  ] as const)('rejects invalid setup-local authority before session validation', async (req, reason) => {
    const authorize = createInstallRequestAuthorizer(deps);

    const result = await authorize(req);

    expect(result).toMatchObject({ authorized: false, reason });
    expect(deps.verifySession).not.toHaveBeenCalled();
  });

  it('rejects malformed authority before reading state', async () => {
    deps.readStoredAuthState.mockRejectedValue(new Error('state unavailable'));
    const authorize = createInstallRequestAuthorizer(deps);

    await expect(authorize(request({ host: null }))).resolves.toEqual({
      authorized: false,
      statusCode: 400,
      reason: 'invalid-install-request',
    });
    expect(deps.readStoredAuthState).not.toHaveBeenCalled();
  });

  it('requires the bootstrap session in init-password mode', async () => {
    deps.getBootstrapState.mockReturnValue({
      startedInSetup: true,
      claimPending: true,
      initSessionRequired: true,
    });
    const authorize = createInstallRequestAuthorizer(deps);
    const req = request({ cookie: 'codexmux-session-token=secret-cookie' });

    await expect(authorize(req)).resolves.toEqual({
      authorized: false,
      statusCode: 401,
      reason: 'install-auth-required',
    });

    deps.verifySession.mockResolvedValue(true);
    await expect(authorize(req)).resolves.toEqual({
      authorized: true,
      mode: 'setup-local',
    });
  });

  it('requires same-authority session admission for configured state', async () => {
    deps.readStoredAuthState.mockResolvedValue({
      mode: 'configured',
      passwordHash: 'hash',
      authSecret: 'secret',
    });
    const authorize = createInstallRequestAuthorizer(deps);
    const req = request({
      host: 'workstation.test:8122',
      origin: 'http://workstation.test:8122',
      remoteAddress: '192.168.1.20',
      cookie: 'session-token=purple-session; codexmux-session-token=secret-cookie',
    });

    await expect(authorize(req)).resolves.toEqual({
      authorized: false,
      statusCode: 401,
      reason: 'install-auth-required',
    });

    deps.verifySession.mockResolvedValue(true);
    await expect(authorize(req)).resolves.toEqual({
      authorized: true,
      mode: 'authenticated',
    });

    deps.verifySession.mockClear();
    await expect(authorize(request({
      host: 'workstation.test:8122',
      origin: 'https://workstation.test',
    }))).resolves.toMatchObject({
      authorized: false,
      statusCode: 403,
      reason: 'install-origin-mismatch',
    });
    expect(deps.verifySession).not.toHaveBeenCalled();
  });

  it('never reopens setup-local after the startup claim closes', async () => {
    deps.getBootstrapState.mockReturnValue({
      startedInSetup: true,
      claimPending: false,
      initSessionRequired: false,
    });
    deps.verifySession.mockResolvedValue(true);
    const authorize = createInstallRequestAuthorizer(deps);

    await expect(authorize(request())).resolves.toEqual({
      authorized: true,
      mode: 'authenticated',
    });
  });

  it('maps state and session dependency failures to a bounded unavailable result', async () => {
    for (const mutate of [
      () => deps.readStoredAuthState.mockRejectedValueOnce(new Error('config path leaked')),
      () => deps.getBootstrapState.mockImplementationOnce(() => { throw new Error('env leaked'); }),
      () => deps.isLoopbackAddress.mockImplementationOnce(() => { throw new Error('address leaked'); }),
      () => deps.readStoredAuthState.mockResolvedValueOnce({
        mode: 'invalid' as const,
        reason: 'missing-auth-secret' as const,
      }),
      () => {
        deps.readStoredAuthState.mockResolvedValueOnce({
          mode: 'configured' as const,
          passwordHash: 'hash',
          authSecret: 'secret',
        });
        deps.verifySession.mockRejectedValueOnce(new Error('cookie leaked'));
      },
    ]) {
      mutate();
      const authorize = createInstallRequestAuthorizer(deps);
      await expect(authorize(request({ cookie: 'private-cookie' }))).resolves.toEqual({
        authorized: false,
        statusCode: 503,
        reason: 'install-auth-unavailable',
      });
    }
  });

  it('does not expose Origin or Cookie values in authorization results', async () => {
    deps.getBootstrapState.mockReturnValue({
      startedInSetup: false,
      claimPending: false,
      initSessionRequired: false,
    });
    const authorize = createInstallRequestAuthorizer(deps);
    const result = await authorize(request({
      origin: 'http://private-hostname.test:8122',
      host: 'different.test:8122',
      cookie: 'codexmux-session-token=private-cookie',
    }));

    expect(JSON.stringify(result)).not.toContain('private-hostname');
    expect(JSON.stringify(result)).not.toContain('private-cookie');
  });
});

describe('install setup lease checker', () => {
  it('distinguishes valid, completed, and unavailable setup leases', async () => {
    const deps = dependencies();
    const checkLease = createInstallSetupLeaseChecker(deps);
    await expect(checkLease()).resolves.toBe('valid');

    deps.getBootstrapState.mockReturnValue({
      startedInSetup: true,
      claimPending: false,
      initSessionRequired: false,
    });
    await expect(checkLease()).resolves.toBe('completed');

    deps.getBootstrapState.mockReturnValue({
      startedInSetup: true,
      claimPending: true,
      initSessionRequired: false,
    });
    deps.readStoredAuthState.mockResolvedValue({
      mode: 'configured',
      passwordHash: 'hash',
      authSecret: 'secret',
    });
    await expect(checkLease()).resolves.toBe('completed');

    deps.readStoredAuthState.mockResolvedValue({
      mode: 'invalid',
      reason: 'missing-auth-secret',
    });
    await expect(checkLease()).resolves.toBe('unavailable');

    deps.readStoredAuthState.mockRejectedValue(new Error('read failed'));
    await expect(checkLease()).resolves.toBe('unavailable');
  });
});
