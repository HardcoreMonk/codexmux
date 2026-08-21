import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readStoredAuthState: vi.fn(),
  needsSetup: vi.fn(),
  updateConfig: vi.fn(),
  generateSecret: vi.fn(),
  hashPassword: vi.fn(),
  updateAccessFromConfig: vi.fn(),
  verifyRequestSession: vi.fn(),
  getBootstrapRuntimeState: vi.fn(),
  markBootstrapClaimed: vi.fn(),
  validateSetupPostRequest: vi.fn(),
}));

vi.mock('@/lib/config-store', () => ({
  MIN_PASSWORD_LENGTH: 4,
  readStoredAuthState: mocks.readStoredAuthState,
  needsSetup: mocks.needsSetup,
  updateConfig: mocks.updateConfig,
  generateSecret: mocks.generateSecret,
  hashPassword: mocks.hashPassword,
}));
vi.mock('@/lib/access-filter', () => ({ updateAccessFromConfig: mocks.updateAccessFromConfig }));
vi.mock('@/lib/auth', () => ({ verifyRequestSession: mocks.verifyRequestSession }));
vi.mock('@/lib/bootstrap-state', () => ({
  getBootstrapRuntimeState: mocks.getBootstrapRuntimeState,
  markBootstrapClaimed: mocks.markBootstrapClaimed,
}));
vi.mock('@/lib/bootstrap-request-guard', () => ({
  validateSetupPostRequest: mocks.validateSetupPostRequest,
}));
vi.mock('@/lib/locales', () => ({ normalizeLocale: (value: unknown) => value || 'ko' }));

import handler from '@/pages/api/auth/setup';

const createResponse = () => {
  let statusCode = 0;
  let body: unknown;
  const headers: Record<string, string | string[] | number> = {};
  const res = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
      return res;
    }),
    setHeader: vi.fn((name: string, value: string | string[] | number) => {
      headers[name] = value;
      return res;
    }),
  } as unknown as NextApiResponse;
  return {
    res,
    get statusCode() { return statusCode; },
    get body() { return body; },
    headers,
  };
};

const createRequest = (overrides: Partial<NextApiRequest> = {}): NextApiRequest => ({
  method: 'POST',
  body: {
    authPassword: 'secure-password',
    locale: 'ko',
    appTheme: 'dark',
    networkAccess: 'localhost',
  },
  headers: {
    host: 'localhost:8122',
    origin: 'http://localhost:8122',
    'content-type': 'application/json',
  },
  rawHeaders: [
    'Host', 'localhost:8122',
    'Origin', 'http://localhost:8122',
    'Content-Type', 'application/json',
  ],
  ...overrides,
}) as NextApiRequest;

beforeEach(() => {
  delete process.env.AUTH_PASSWORD;
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.INIT_PASSWORD;
  delete process.env.HOST;
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.readStoredAuthState.mockResolvedValue({ mode: 'setup-required', authSecret: null });
  mocks.needsSetup.mockResolvedValue(true);
  mocks.updateConfig.mockResolvedValue(undefined);
  mocks.generateSecret.mockReturnValue('generated-secret');
  mocks.hashPassword.mockResolvedValue('hashed-password');
  mocks.verifyRequestSession.mockResolvedValue(false);
  mocks.getBootstrapRuntimeState.mockReturnValue({
    startedInSetup: true,
    claimPending: true,
    initSessionRequired: false,
  });
  mocks.validateSetupPostRequest.mockReturnValue({ allowed: true });
});

describe('/api/auth/setup', () => {
  it('reports setup only while the startup claim is pending', async () => {
    const open = createResponse();
    await handler(createRequest({ method: 'GET', body: undefined }), open.res);
    expect(open.body).toMatchObject({ needsSetup: true, requiresAuth: false });

    mocks.getBootstrapRuntimeState.mockReturnValue({
      startedInSetup: true,
      claimPending: false,
      initSessionRequired: false,
    });
    const claimed = createResponse();
    await handler(createRequest({ method: 'GET', body: undefined }), claimed.res);
    expect(claimed.body).toMatchObject({ needsSetup: false, requiresAuth: false });
  });

  it('returns the request guard error before reading setup input', async () => {
    mocks.validateSetupPostRequest.mockReturnValue({
      allowed: false,
      statusCode: 415,
      reason: 'setup-json-required',
    });
    const response = createResponse();

    await handler(createRequest(), response.res);

    expect(response.statusCode).toBe(415);
    expect(response.body).toEqual({ error: 'setup-json-required' });
    expect(mocks.readStoredAuthState).not.toHaveBeenCalled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('rejects a claim when the process did not start in setup or is already claimed', async () => {
    for (const state of [
      { startedInSetup: false, claimPending: false, initSessionRequired: false },
      { startedInSetup: true, claimPending: false, initSessionRequired: false },
    ]) {
      mocks.getBootstrapRuntimeState.mockReturnValue(state);
      const response = createResponse();
      await handler(createRequest(), response.res);
      expect(response.statusCode).toBe(409);
    }
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('requires the INIT session before writing config', async () => {
    mocks.getBootstrapRuntimeState.mockReturnValue({
      startedInSetup: true,
      claimPending: true,
      initSessionRequired: true,
    });
    const response = createResponse();

    await handler(createRequest(), response.res);

    expect(response.statusCode).toBe(401);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('rejects short passwords on the server', async () => {
    const response = createResponse();

    await handler(createRequest({ body: { authPassword: 'abc' } }), response.res);

    expect(response.statusCode).toBe(400);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it('returns 503 for unavailable or invalid stored auth state', async () => {
    for (const state of [
      new Error('read failed'),
      { mode: 'invalid', reason: 'missing-auth-secret' },
    ]) {
      if (state instanceof Error) mocks.readStoredAuthState.mockRejectedValueOnce(state);
      else mocks.readStoredAuthState.mockResolvedValueOnce(state);
      const response = createResponse();
      await handler(createRequest(), response.res);
      expect(response.statusCode).toBe(503);
    }
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('updates config and runtime credentials before closing the claim latch', async () => {
    const response = createResponse();

    await handler(createRequest(), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      authPassword: 'hashed-password',
      authSecret: 'generated-secret',
      networkAccess: 'localhost',
    }));
    expect(process.env.AUTH_PASSWORD).toBe('hashed-password');
    expect(process.env.NEXTAUTH_SECRET).toBe('generated-secret');
    expect(mocks.updateAccessFromConfig).toHaveBeenCalledWith('localhost');
    expect(mocks.markBootstrapClaimed).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markBootstrapClaimed.mock.invocationCallOrder[0],
    );
  });

  it('allows exactly one of two concurrent setup claims', async () => {
    let claimPending = true;
    let releaseWrite!: () => void;
    const writeBlocked = new Promise<void>((resolve) => { releaseWrite = resolve; });
    mocks.updateConfig.mockImplementationOnce(() => writeBlocked);
    mocks.getBootstrapRuntimeState.mockImplementation(() => ({
      startedInSetup: true,
      claimPending,
      initSessionRequired: false,
    }));
    mocks.markBootstrapClaimed.mockImplementation(() => { claimPending = false; });
    const first = createResponse();
    const second = createResponse();

    const firstCall = handler(createRequest(), first.res);
    await vi.waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledTimes(1));
    const secondCall = handler(createRequest(), second.res);
    releaseWrite();
    await Promise.all([firstCall, secondCall]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
    expect(mocks.markBootstrapClaimed).toHaveBeenCalledTimes(1);
  });

  it('does not mutate runtime state when config write fails', async () => {
    mocks.updateConfig.mockRejectedValue(new Error('disk full'));
    const response = createResponse();

    await expect(handler(createRequest(), response.res)).rejects.toThrow('disk full');

    expect(process.env.AUTH_PASSWORD).toBeUndefined();
    expect(process.env.NEXTAUTH_SECRET).toBeUndefined();
    expect(mocks.updateAccessFromConfig).not.toHaveBeenCalled();
    expect(mocks.markBootstrapClaimed).not.toHaveBeenCalled();
  });
});
