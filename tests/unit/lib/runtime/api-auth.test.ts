import type { IncomingMessage } from 'http';
import type { NextApiRequest } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { verifyRuntimeV2ApiAuth, verifyRuntimeV2WebSocketAuth } from '@/lib/runtime/api-auth';

vi.mock('@/lib/cli-token', () => ({
  verifyTokenValue: vi.fn((value: string) => value === 'valid-cli-token'),
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    verifySessionToken: vi.fn(async (value: string) => value === 'valid-session-token' ? { sub: 'user' } : null),
  };
});

const req = (headers: Record<string, string>, url = '/api/v2/runtime/health'): NextApiRequest =>
  ({ headers, url } as NextApiRequest);
const wsReq = (headers: Record<string, string>, url = '/api/v2/terminal?session=rtv2-a'): IncomingMessage =>
  ({ headers, url } as IncomingMessage);

describe('runtime v2 api auth', () => {
  it('accepts x-cmux-token', async () => {
    await expect(verifyRuntimeV2ApiAuth(req({ 'x-cmux-token': 'valid-cli-token' }))).resolves.toBe(true);
  });

  it('accepts the session cookie', async () => {
    await expect(verifyRuntimeV2ApiAuth(req({ cookie: 'session-token=valid-session-token' }))).resolves.toBe(true);
  });

  it('rejects missing credentials', async () => {
    await expect(verifyRuntimeV2ApiAuth(req({}))).resolves.toBe(false);
  });

  it('rejects credential query parameters before header or cookie auth', async () => {
    const forbiddenNames = [
      'token',
      'x-cmux-token',
      'authorization',
      'auth',
      'api_key',
      'apikey',
      'access_token',
      'session-token',
      'ToKeN',
    ];

    for (const name of forbiddenNames) {
      await expect(verifyRuntimeV2ApiAuth(req(
        { 'x-cmux-token': 'valid-cli-token', cookie: 'session-token=valid-session-token' },
        `/api/v2/runtime/health?${name}=valid-cli-token`,
      ))).resolves.toBe(false);
    }
  });

  it('fails closed for malformed request URLs', async () => {
    await expect(verifyRuntimeV2ApiAuth(req(
      { 'x-cmux-token': 'valid-cli-token', cookie: 'session-token=valid-session-token' },
      'http://[::1',
    ))).resolves.toBe(false);
  });
});

describe('runtime v2 websocket auth', () => {
  it('accepts session cookie for browser websocket clients', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq({ cookie: 'session-token=valid-session-token' }))).resolves.toBe(true);
  });

  it('accepts x-cmux-token for node smoke websocket clients', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq({ 'x-cmux-token': 'valid-cli-token' }))).resolves.toBe(true);
  });

  it('rejects credential query parameters but allows the terminal session query', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq(
      { cookie: 'session-token=valid-session-token' },
      '/api/v2/terminal?session=rtv2-a',
    ))).resolves.toBe(true);

    for (const name of ['token', 'authorization', 'API_KEY', 'access_token', 'session-token']) {
      await expect(verifyRuntimeV2WebSocketAuth(wsReq(
        { cookie: 'session-token=valid-session-token' },
        `/api/v2/terminal?session=rtv2-a&${name}=valid-cli-token`,
      ))).resolves.toBe(false);
    }
  });

  it('fails closed for malformed websocket request URLs', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq(
      { 'x-cmux-token': 'valid-cli-token', cookie: 'session-token=valid-session-token' },
      'http://[::1',
    ))).resolves.toBe(false);
  });
});
