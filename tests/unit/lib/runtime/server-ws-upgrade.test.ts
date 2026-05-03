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
    noAuthPaths: new Set(['/api/install']),
    wsPaths: new Set(['/api/terminal', '/api/v2/terminal']),
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

  it('factory rejects disallowed remotes and fail-closes route errors', async () => {
    const socket = new FakeSocket();
    const rejectSocket = vi.fn();
    const routeUpgrade = vi.fn(() => {
      throw new Error('route failed');
    });
    const onUpgradeError = vi.fn();
    const handler = createWebSocketUpgradeHandler({
      port: 8122,
      noAuthPaths: new Set(),
      wsPaths: new Set(),
      handleKnownUpgrade: vi.fn(),
      handleRuntimeTerminalUpgrade: vi.fn(),
      fallbackUpgrade: vi.fn(),
      verifyGenericAuth: vi.fn(async () => true),
      isRequestAllowed: () => true,
      rejectSocket,
      onUpgradeError,
      routeUpgrade,
    });

    await handler(request('/api/terminal') as never, socket as never, Buffer.alloc(0));

    expect(onUpgradeError).toHaveBeenCalled();
    expect(socket.destroyed).toBe(true);
    expect(socket.ended).toEqual([]);

    const deniedSocket = new FakeSocket();
    const denied = createWebSocketUpgradeHandler({
      port: 8122,
      noAuthPaths: new Set(),
      wsPaths: new Set(),
      handleKnownUpgrade: vi.fn(),
      handleRuntimeTerminalUpgrade: vi.fn(),
      fallbackUpgrade: vi.fn(),
      verifyGenericAuth: vi.fn(async () => true),
      isRequestAllowed: () => false,
      rejectSocket,
      routeUpgrade: vi.fn(),
    });

    await denied(request('/api/terminal') as never, deniedSocket as never, Buffer.alloc(0));
    expect(rejectSocket).toHaveBeenCalledWith(deniedSocket);
  });
});
