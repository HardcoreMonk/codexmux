import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDefinitions: vi.fn(),
  readAuditEvents: vi.fn(),
  runAction: vi.fn(),
}));

vi.mock('@/lib/runtime/lifecycle-actions', () => ({
  getLifecycleActionService: () => mocks,
}));

import handler from '@/pages/api/runtime/lifecycle/action';

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
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    headers,
  };
};

const createRequest = (method: string, body?: unknown, query: Record<string, string> = {}): NextApiRequest =>
  ({ method, body, query }) as unknown as NextApiRequest;

describe('/api/runtime/lifecycle/action', () => {
  beforeEach(() => {
    mocks.getDefinitions.mockReset();
    mocks.readAuditEvents.mockReset();
    mocks.runAction.mockReset();
    mocks.getDefinitions.mockReturnValue([{ id: 'phase6-gate', confirmationPhrase: null }]);
    mocks.readAuditEvents.mockResolvedValue([]);
    mocks.runAction.mockResolvedValue({ ok: true, event: { actionId: 'phase6-gate', status: 'succeeded' } });
  });

  it('returns definitions and recent audit events', async () => {
    const response = createResponse();

    await handler(createRequest('GET', undefined, { limit: '999' }), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.readAuditEvents).toHaveBeenCalledWith({ limit: 100 });
    expect(response.body).toEqual({
      actions: [{ id: 'phase6-gate', confirmationPhrase: null }],
      events: [],
    });
  });

  it('runs an allowlisted action without accepting command text', async () => {
    const response = createResponse();

    await handler(createRequest('POST', {
      actionId: 'phase6-gate',
      command: 'rm -rf /',
      confirmation: '',
    }), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.runAction).toHaveBeenCalledWith({ actionId: 'phase6-gate', confirmation: '' });
    expect(JSON.stringify(mocks.runAction.mock.calls)).not.toContain('rm -rf');
  });

  it('maps rejected actions to a 409 response', async () => {
    mocks.runAction.mockResolvedValue({
      ok: false,
      event: { actionId: 'restart-service', status: 'rejected', error: 'confirmation-required' },
    });
    const response = createResponse();

    await handler(createRequest('POST', { actionId: 'restart-service', confirmation: 'restart' }), response.res);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: 'confirmation-required',
      event: { actionId: 'restart-service', status: 'rejected', error: 'confirmation-required' },
    });
  });

  it('rejects requests without a string action id', async () => {
    const response = createResponse();

    await handler(createRequest('POST', { confirmation: '' }), response.res);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'action-id-required' });
    expect(mocks.runAction).not.toHaveBeenCalled();
  });

  it('returns 405 for unsupported methods', async () => {
    const response = createResponse();

    await handler(createRequest('DELETE'), response.res);

    expect(response.statusCode).toBe(405);
    expect(response.headers.Allow).toEqual(['GET', 'POST']);
    expect(response.body).toEqual({ error: 'method-not-allowed' });
  });
});
