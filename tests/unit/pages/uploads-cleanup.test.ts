import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanupAllUploads: vi.fn(),
  cleanupExpiredUploads: vi.fn(),
  cleanupStaleUploadParts: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/uploads-store', () => ({
  cleanupAllUploads: mocks.cleanupAllUploads,
  cleanupExpiredUploads: mocks.cleanupExpiredUploads,
  cleanupStaleUploadParts: mocks.cleanupStaleUploadParts,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: mocks.logError }),
}));

import handler from '@/pages/api/uploads/cleanup';

const createRequest = (
  method: string = 'POST',
  body?: unknown,
): NextApiRequest => ({ method, body }) as NextApiRequest;

const createResponse = () => {
  let statusCode = 0;
  let body: unknown;
  const headers: Record<string, number | string | string[]> = {};
  const res = {
    setHeader: vi.fn((name: string, value: number | string | string[]) => {
      headers[name] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
      return res;
    }),
  } as unknown as NextApiResponse;

  return {
    res,
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.cleanupAllUploads.mockResolvedValue({ deleted: 1, freedBytes: 10 });
  mocks.cleanupExpiredUploads.mockResolvedValue({ deleted: 2, freedBytes: 20 });
  mocks.cleanupStaleUploadParts.mockResolvedValue({ deleted: 3, freedBytes: 30 });
});

describe('/api/uploads/cleanup', () => {
  it('rejects non-POST methods without invoking cleanup', async () => {
    const response = createResponse();

    await handler(createRequest('GET'), response.res);

    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({ error: 'Method not allowed' });
    expect(response.headers.Allow).toBe('POST');
    expect(mocks.cleanupAllUploads).not.toHaveBeenCalled();
    expect(mocks.cleanupExpiredUploads).not.toHaveBeenCalled();
    expect(mocks.cleanupStaleUploadParts).not.toHaveBeenCalled();
  });

  it('aggregates committed and staged cleanup in all mode', async () => {
    const response = createResponse();

    await handler(createRequest('POST', { mode: 'all' }), response.res);

    expect(mocks.cleanupAllUploads).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupExpiredUploads).not.toHaveBeenCalled();
    expect(mocks.cleanupStaleUploadParts).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupAllUploads.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cleanupStaleUploadParts.mock.invocationCallOrder[0],
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ mode: 'all', deleted: 4, freedBytes: 40 });
  });

  it.each([
    ['missing body', undefined],
    ['missing mode', {}],
    ['unknown mode', { mode: 'future' }],
  ])('defaults %s to expired committed and staged cleanup', async (_, body) => {
    const response = createResponse();

    await handler(createRequest('POST', body), response.res);

    expect(mocks.cleanupExpiredUploads).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupAllUploads).not.toHaveBeenCalled();
    expect(mocks.cleanupStaleUploadParts).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ mode: 'expired', deleted: 5, freedBytes: 50 });
  });

  it('returns the exact existing error without running staged cleanup when committed cleanup fails', async () => {
    mocks.cleanupExpiredUploads.mockRejectedValue(new Error('/private/upload/path: EACCES'));
    const response = createResponse();

    await handler(createRequest(), response.res);

    expect(mocks.cleanupStaleUploadParts).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Cleanup failed' });
    expect(mocks.logError).toHaveBeenCalledWith('uploads cleanup failed');
  });

  it('returns 500 instead of partial success when staged cleanup fails', async () => {
    mocks.cleanupStaleUploadParts.mockRejectedValue(new Error('/private/stage/path: EIO'));
    const response = createResponse();

    await handler(createRequest('POST', { mode: 'all' }), response.res);

    expect(mocks.cleanupAllUploads).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupStaleUploadParts).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Cleanup failed' });
    expect(response.res.status).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith('uploads cleanup failed');
  });
});
