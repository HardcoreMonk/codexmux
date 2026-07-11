import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import { describe, expect, it, vi } from 'vitest';
import {
  createWebSocketUpgradeHandler,
  parseTerminalDimension,
  routeWebSocketUpgrade,
  type IRouteWebSocketUpgradeOptions,
} from '@/lib/runtime/server-ws-upgrade';

class FakeSocket extends EventEmitter {
  destroyed = false;
  ended: string[] = [];
  writes: string[] = [];
  remoteAddress = '127.0.0.1';

  end = (value: string): void => {
    this.ended.push(value);
  };

  write = (value: string): void => {
    this.writes.push(value);
  };

  destroy = (): void => {
    this.destroyed = true;
  };
}

const request = (url: string, headers: IncomingMessage['headers'] = {}): IncomingMessage =>
  ({
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as IncomingMessage);

const baseOptions = (overrides: Partial<IRouteWebSocketUpgradeOptions> = {}) => {
  const socket = new FakeSocket();
  const options: IRouteWebSocketUpgradeOptions = {
    request: request('/api/v2/terminal?session=rtv2-ws-a-pane-b-tab-c'),
    socket: socket as never,
    head: Buffer.alloc(0),
    port: 8122,
    wsPaths: new Set(['/api/terminal', '/api/v2/terminal']),
    authorizeInstallRequest: vi.fn(async () => ({
      authorized: true as const,
      mode: 'setup-local' as const,
    })),
    handleInstallUpgrade: vi.fn(),
    handleKnownUpgrade: vi.fn(),
    handleRuntimeTerminalUpgrade: vi.fn(),
    fallbackUpgrade: vi.fn(),
    verifyRuntimeAuth: vi.fn(async () => true),
    verifyGenericAuth: vi.fn(async () => true),
    runtimeEnabled: () => true,
    ...overrides,
  };
  return { socket, options };
};

const expectJsonError = (socket: FakeSocket, status: string, error: string): void => {
  expect(socket.ended).toHaveLength(1);
  const payload = JSON.stringify({ error });
  expect(socket.ended[0]).toContain(`HTTP/1.1 ${status}`);
  expect(socket.ended[0]).toContain('Content-Type: application/json');
  expect(socket.ended[0]).toContain(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}`);
  expect(socket.ended[0]).toContain('Connection: close');
  expect(socket.ended[0]).toContain(`\r\n\r\n${payload}`);
};

describe('runtime websocket upgrade routing', () => {
  it('parses terminal dimensions defensively', () => {
    for (const value of ['1e2', '0x10', '-1', '1.5', '0', '080', '', ' 80 ']) {
      expect(parseTerminalDimension(value, 80, 500)).toBe(80);
    }
    expect(parseTerminalDimension(null, 24, 200)).toBe(24);
    expect(parseTerminalDimension('999', 80, 500)).toBe(500);
    expect(parseTerminalDimension('120', 80, 500)).toBe(120);
  });

  it('routes v2 terminal upgrades through runtime auth before generic auth', async () => {
    const calls: string[] = [];
    const { options } = baseOptions({
      request: request('/api/v2/terminal?session=rtv2-ws-a-pane-b-tab-c&cols=999&rows=40', {
        'x-cmux-token': 'valid-cli-token',
      }),
      verifyRuntimeAuth: vi.fn(async () => {
        calls.push('runtime');
        return true;
      }),
      verifyGenericAuth: vi.fn(async () => {
        calls.push('generic');
        return false;
      }),
    });

    await routeWebSocketUpgrade(options);

    expect(calls).toEqual(['runtime']);
    expect(options.handleRuntimeTerminalUpgrade).toHaveBeenCalledWith(
      { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 500, rows: 40 },
      options.request,
      options.socket,
      options.head,
    );
    expect(options.handleKnownUpgrade).not.toHaveBeenCalled();
    expect(options.fallbackUpgrade).not.toHaveBeenCalled();
  });

  it('rejects disabled runtime before auth or handleUpgrade', async () => {
    const { socket, options } = baseOptions({ runtimeEnabled: () => false });

    await routeWebSocketUpgrade(options);

    expectJsonError(socket, '404 Not Found', 'runtime-v2-disabled');
    expect(options.verifyRuntimeAuth).not.toHaveBeenCalled();
    expect(options.verifyGenericAuth).not.toHaveBeenCalled();
    expect(options.handleRuntimeTerminalUpgrade).not.toHaveBeenCalled();
  });

  it('rejects invalid urls, runtime namespace misses, invalid sessions, and auth throws', async () => {
    for (const [url, status, error] of [
      ['http://evil.test/api/v2/terminal?session=rtv2-ws-a-pane-b-tab-c', '400 Bad Request', 'invalid-websocket-url'],
      ['/api/v2/terminal?session=rtv2-a:b', '400 Bad Request', 'invalid-runtime-v2-terminal-session'],
      ['/api/v2/terminal?session=rtv2-a&session=rtv2-b', '400 Bad Request', 'invalid-runtime-v2-terminal-session'],
      ['/api/v2/unknown', '404 Not Found', 'runtime-v2-upgrade-not-found'],
      ['/api%2Fv2%2Fterminal?session=rtv2-ws-a-pane-b-tab-c', '400 Bad Request', 'invalid-websocket-url'],
    ] as const) {
      const { socket, options } = baseOptions({ request: request(url) });
      await routeWebSocketUpgrade(options);
      expectJsonError(socket, status, error);
      expect(options.handleRuntimeTerminalUpgrade).not.toHaveBeenCalled();
      expect(options.authorizeInstallRequest).not.toHaveBeenCalled();
      expect(options.handleInstallUpgrade).not.toHaveBeenCalled();
      expect(options.handleKnownUpgrade).not.toHaveBeenCalled();
      expect(options.fallbackUpgrade).not.toHaveBeenCalled();
    }

    const auth = baseOptions({
      verifyRuntimeAuth: vi.fn(async () => {
        throw new Error('auth failed');
      }),
    });
    await routeWebSocketUpgrade(auth.options);
    expectJsonError(auth.socket, '401 Unauthorized', 'Unauthorized');
  });

  it('routes install through its authorizer and immutable typed context', async () => {
    const { options } = baseOptions({
      request: request('/api/install?command=codex'),
      wsPaths: new Set(['/api/install']),
      verifyGenericAuth: vi.fn(async () => false),
    });

    await routeWebSocketUpgrade(options);

    expect(options.authorizeInstallRequest).toHaveBeenCalledWith(options.request);
    expect(options.handleInstallUpgrade).toHaveBeenCalledTimes(1);
    const [context, handledRequest, handledSocket, handledHead] = vi.mocked(
      options.handleInstallUpgrade,
    ).mock.calls[0];
    expect(context).toEqual({
      route: 'install',
      url: expect.objectContaining({ pathname: '/api/install' }),
      authorization: { authorized: true, mode: 'setup-local' },
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.authorization)).toBe(true);
    expect(handledRequest).toBe(options.request);
    expect(handledSocket).toBe(options.socket);
    expect(handledHead).toBe(options.head);
    expect(options.verifyGenericAuth).not.toHaveBeenCalled();
    expect(options.handleKnownUpgrade).not.toHaveBeenCalled();
    expect(options.fallbackUpgrade).not.toHaveBeenCalled();
  });

  it('returns bounded install authorization failures without upgrading', async () => {
    const rejected = baseOptions({
      request: request('/api/install'),
      authorizeInstallRequest: vi.fn(async () => ({
        authorized: false as const,
        statusCode: 403 as const,
        reason: 'install-origin-mismatch' as const,
      })),
    });

    await routeWebSocketUpgrade(rejected.options);

    expectJsonError(rejected.socket, '403 Forbidden', 'install-origin-mismatch');
    expect(rejected.options.handleInstallUpgrade).not.toHaveBeenCalled();
    expect(rejected.options.handleKnownUpgrade).not.toHaveBeenCalled();
    expect(rejected.options.fallbackUpgrade).not.toHaveBeenCalled();

    const unavailable = baseOptions({
      request: request('/api/install'),
      authorizeInstallRequest: vi.fn(async () => {
        throw new Error('sensitive dependency failure');
      }),
    });

    await routeWebSocketUpgrade(unavailable.options);

    expectJsonError(unavailable.socket, '503 Service Unavailable', 'install-auth-unavailable');
    expect(unavailable.options.handleInstallUpgrade).not.toHaveBeenCalled();
    expect(unavailable.options.handleKnownUpgrade).not.toHaveBeenCalled();
    expect(unavailable.options.fallbackUpgrade).not.toHaveBeenCalled();
  });

  it('routes legacy known upgrades after generic auth and falls back otherwise', async () => {
    const legacy = baseOptions({ request: request('/api/terminal?session=pt-a') });
    await routeWebSocketUpgrade(legacy.options);
    expect(legacy.options.verifyGenericAuth).toHaveBeenCalled();
    expect(legacy.options.handleKnownUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/api/terminal' }),
      legacy.options.request,
      legacy.options.socket,
      legacy.options.head,
    );

    const fallback = baseOptions({ request: request('/_next/webpack-hmr') });
    await routeWebSocketUpgrade(fallback.options);
    expect(fallback.options.fallbackUpgrade).toHaveBeenCalledWith(fallback.options.request, fallback.options.socket, fallback.options.head);
  });

  it('awaits and contains a rejected asynchronous upgrade fallback', async () => {
    const error = new Error('next upgrade rejected');
    const socket = new FakeSocket();
    const onUpgradeError = vi.fn();
    const handler = createWebSocketUpgradeHandler({
      port: 8122,
      wsPaths: new Set(),
      authorizeInstallRequest: vi.fn(async () => ({
        authorized: true as const,
        mode: 'setup-local' as const,
      })),
      handleInstallUpgrade: vi.fn(),
      handleKnownUpgrade: vi.fn(),
      handleRuntimeTerminalUpgrade: vi.fn(),
      fallbackUpgrade: vi.fn(async () => {
        throw error;
      }),
      verifyGenericAuth: vi.fn(async () => true),
      validateUpgradeRequest: () => ({ allowed: true }),
      onUpgradeError,
    });

    await handler(request('/_next/webpack-hmr') as never, socket as never, Buffer.alloc(0));

    expect(onUpgradeError).toHaveBeenCalledWith(error);
    expect(socket.destroyed).toBe(true);
  });

  it('factory fail-closes route errors after request admission', async () => {
    const socket = new FakeSocket();
    const routeUpgrade = vi.fn(() => {
      throw new Error('route failed');
    });
    const onUpgradeError = vi.fn();
    const handler = createWebSocketUpgradeHandler({
      port: 8122,
      wsPaths: new Set(),
      authorizeInstallRequest: vi.fn(async () => ({
        authorized: true as const,
        mode: 'setup-local' as const,
      })),
      handleInstallUpgrade: vi.fn(),
      handleKnownUpgrade: vi.fn(),
      handleRuntimeTerminalUpgrade: vi.fn(),
      fallbackUpgrade: vi.fn(),
      verifyGenericAuth: vi.fn(async () => true),
      validateUpgradeRequest: () => ({ allowed: true }),
      onUpgradeError,
      routeUpgrade,
    });

    await handler(request('/api/terminal') as never, socket as never, Buffer.alloc(0));

    expect(onUpgradeError).toHaveBeenCalled();
    expect(socket.destroyed).toBe(true);
    expect(socket.ended).toEqual([]);
  });

  it.each([
    [403, 'source-forbidden', '403 Forbidden'],
    [400, 'missing-host', '400 Bad Request'],
    [503, 'bootstrap-state-unavailable', '503 Service Unavailable'],
  ] as const)(
    'returns a bounded outer guard rejection (%i %s) before routing',
    async (statusCode, reason, statusLine) => {
      const socket = new FakeSocket();
      const routeUpgrade = vi.fn();
      const handler = createWebSocketUpgradeHandler({
        port: 8122,
        wsPaths: new Set(),
        authorizeInstallRequest: vi.fn(async () => ({
          authorized: true as const,
          mode: 'setup-local' as const,
        })),
        handleInstallUpgrade: vi.fn(),
        handleKnownUpgrade: vi.fn(),
        handleRuntimeTerminalUpgrade: vi.fn(),
        fallbackUpgrade: vi.fn(),
        verifyGenericAuth: vi.fn(async () => true),
        validateUpgradeRequest: () => ({
          allowed: false,
          statusCode,
          reason,
        }),
        routeUpgrade,
      });

      await handler(request('/api/terminal') as never, socket as never, Buffer.alloc(0));

      expectJsonError(socket, statusLine, reason);
      expect(routeUpgrade).not.toHaveBeenCalled();
    },
  );
});
