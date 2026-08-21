import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedPreflightStatus: vi.fn(),
  readStoredAuthState: vi.fn(),
  needsSetup: vi.fn(),
  verifyRequestSession: vi.fn(),
  verifyCliToken: vi.fn(),
  getBootstrapRuntimeState: vi.fn(),
}));

vi.mock('@/lib/preflight', () => ({ getCachedPreflightStatus: mocks.getCachedPreflightStatus }));
vi.mock('@/lib/config-store', () => ({
  readStoredAuthState: mocks.readStoredAuthState,
  needsSetup: mocks.needsSetup,
}));
vi.mock('@/lib/auth', () => ({ verifyRequestSession: mocks.verifyRequestSession }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: mocks.verifyCliToken }));
vi.mock('@/lib/bootstrap-state', () => ({
  getBootstrapRuntimeState: mocks.getBootstrapRuntimeState,
}));

import handler from '@/pages/api/auth/preflight';

const createResponse = () => {
  let statusCode = 0;
  let body: unknown;
  const res = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
      return res;
    }),
    setHeader: vi.fn(() => res),
  } as unknown as NextApiResponse;
  return { res, get statusCode() { return statusCode; }, get body() { return body; } };
};

const request = (method = 'GET'): NextApiRequest => ({
  method,
  headers: {},
}) as NextApiRequest;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getCachedPreflightStatus.mockResolvedValue({ git: { installed: true } });
  mocks.readStoredAuthState.mockResolvedValue({ mode: 'setup-required', authSecret: null });
  mocks.needsSetup.mockResolvedValue(true);
  mocks.verifyRequestSession.mockResolvedValue(false);
  mocks.verifyCliToken.mockReturnValue(false);
  mocks.getBootstrapRuntimeState.mockReturnValue({
    startedInSetup: true,
    claimPending: true,
    initSessionRequired: false,
  });
});

describe('/api/auth/preflight', () => {
  it('allows setup-open preflight before the first claim', async () => {
    const response = createResponse();

    await handler(request(), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.verifyRequestSession).not.toHaveBeenCalled();
  });

  it('requires a session in init-password mode', async () => {
    mocks.getBootstrapRuntimeState.mockReturnValue({
      startedInSetup: true,
      claimPending: true,
      initSessionRequired: true,
    });
    const denied = createResponse();
    await handler(request(), denied.res);
    expect(denied.statusCode).toBe(401);
    expect(mocks.getCachedPreflightStatus).not.toHaveBeenCalled();

    mocks.verifyRequestSession.mockResolvedValue(true);
    const allowed = createResponse();
    await handler(request(), allowed.res);
    expect(allowed.statusCode).toBe(200);
  });

  it('requires normal auth after claim even if config returns to setup shape', async () => {
    mocks.getBootstrapRuntimeState.mockReturnValue({
      startedInSetup: true,
      claimPending: false,
      initSessionRequired: false,
    });
    const response = createResponse();

    await handler(request(), response.res);

    expect(response.statusCode).toBe(401);
    expect(mocks.getCachedPreflightStatus).not.toHaveBeenCalled();
  });

  it('accepts CLI or session auth for configured state', async () => {
    mocks.readStoredAuthState.mockResolvedValue({
      mode: 'configured',
      passwordHash: 'hash',
      authSecret: 'secret',
    });
    mocks.getBootstrapRuntimeState.mockReturnValue({
      startedInSetup: false,
      claimPending: false,
      initSessionRequired: false,
    });
    mocks.verifyCliToken.mockReturnValue(true);
    const response = createResponse();

    await handler(request(), response.res);

    expect(response.statusCode).toBe(200);
  });

  it('returns 503 without preflight work for missing or invalid state', async () => {
    for (const state of [
      new Error('read failed'),
      { mode: 'invalid', reason: 'missing-auth-secret' },
    ]) {
      if (state instanceof Error) mocks.readStoredAuthState.mockRejectedValueOnce(state);
      else mocks.readStoredAuthState.mockResolvedValueOnce(state);
      const response = createResponse();
      await handler(request(), response.res);
      expect(response.statusCode).toBe(503);
    }
    expect(mocks.getCachedPreflightStatus).not.toHaveBeenCalled();
  });
});
