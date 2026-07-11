import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IUploadServer } from '@/lib/upload-server';

const logMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: logMocks.error }),
}));

import {
  createOuterServerLifecycle,
  createServerHttpDispatcher,
  listenWithFallback,
} from '@/lib/server-http-dispatcher';

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const deferred = <T>(): IDeferred<T> => {
  let resolve = (_value: T): void => undefined;
  let reject = (_error: unknown): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

class FakeSocket extends EventEmitter {
  destroyed = false;
  writable = true;
  end = vi.fn(() => {
    this.writable = false;
  });
  destroy = vi.fn(() => {
    this.destroyed = true;
    this.writable = false;
    this.emit('close');
  });
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  readonly headers = new Map<string, number | string | string[]>();
  readonly chunks: Buffer[] = [];
  readonly socket: FakeSocket;
  writeContinue = vi.fn();

  constructor(socket: FakeSocket) {
    super();
    this.socket = socket;
  }

  setHeader = vi.fn((name: string, value: number | string | readonly string[]): this => {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? [...value] : value as number | string);
    return this;
  });

  getHeader = (name: string): number | string | string[] | undefined =>
    this.headers.get(name.toLowerCase());

  end = vi.fn((chunk?: string | Buffer): this => {
    if (chunk !== undefined) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    this.headersSent = true;
    this.writableEnded = true;
    queueMicrotask(() => this.emit('finish'));
    return this;
  });

  json = (): unknown => JSON.parse(Buffer.concat(this.chunks).toString('utf8')) as unknown;
}

type TRequest = IncomingMessage & { pause: ReturnType<typeof vi.fn> };

const createRequest = (
  socket: FakeSocket,
  url: string,
  rawHeaders: string[] = ['Host', 'localhost:8122'],
): TRequest => {
  const headers: IncomingMessage['headers'] = {};
  for (let index = 0; index < rawHeaders.length; index += 2) {
    headers[rawHeaders[index].toLowerCase()] = rawHeaders[index + 1] ?? '';
  }
  return {
    url,
    method: 'GET',
    headers,
    rawHeaders: [...rawHeaders],
    socket,
    pause: vi.fn(),
  } as unknown as TRequest;
};

const asResponse = (response: FakeResponse): ServerResponse =>
  response as unknown as ServerResponse;

const asSocket = (socket: FakeSocket): Duplex => socket as unknown as Duplex;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

const createUploadServer = (overrides: Partial<IUploadServer> = {}): IUploadServer => ({
  classify: vi.fn((request: Pick<IncomingMessage, 'url'>) =>
    request.url?.includes('upload-file')
      ? { matched: true as const, valid: true as const, policy: {} as never }
      : { matched: false as const }),
  start: vi.fn(async () => undefined),
  handleRequest: vi.fn(async () => undefined),
  handleUpgradeAttempt: vi.fn(async () => undefined),
  beginShutdown: vi.fn(),
  shutdown: vi.fn(async () => undefined),
  ...overrides,
});

beforeEach(() => {
  logMocks.error.mockReset();
});

describe('server HTTP dispatcher', () => {
  it('claims a matching socket synchronously and pauses follow-up requests without destroying it', async () => {
    const upload = deferred<void>();
    const uploadServer = createUploadServer({
      handleRequest: vi.fn(() => upload.promise),
    });
    const fallbackRequest = vi.fn();
    const validateRequest = vi.fn(() => ({ allowed: true as const }));
    const dispatcher = createServerHttpDispatcher({
      validateRequest,
      uploadServer,
      fallbackRequest,
      fallbackUpgrade: vi.fn(),
    });
    const socket = new FakeSocket();
    const owner = createRequest(socket, '/api/upload-file');
    const followUp = createRequest(socket, '/ordinary');

    expect(dispatcher.handleRequest(owner, asResponse(new FakeResponse(socket)))).toBeUndefined();
    expect(dispatcher.handleRequest(followUp, asResponse(new FakeResponse(socket)))).toBeUndefined();

    expect(followUp.pause).toHaveBeenCalledTimes(1);
    expect(fallbackRequest).not.toHaveBeenCalled();
    expect(validateRequest).toHaveBeenCalledTimes(1);
    expect(socket.destroy).not.toHaveBeenCalled();

    upload.resolve();
    await flush();
    const beforeClose = createRequest(socket, '/still-quarantined');
    dispatcher.handleRequest(beforeClose, asResponse(new FakeResponse(socket)));
    expect(beforeClose.pause).toHaveBeenCalledTimes(1);

    socket.emit('close');
    const afterClose = createRequest(socket, '/released');
    dispatcher.handleRequest(afterClose, asResponse(new FakeResponse(socket)));
    expect(afterClose.pause).not.toHaveBeenCalled();
    expect(fallbackRequest).toHaveBeenCalledTimes(1);
  });

  it('orders raw classification and quarantine before the outer guard and upload/fallback', () => {
    const order: string[] = [];
    const uploadServer = createUploadServer({
      classify: vi.fn((request) => {
        order.push(`classify:${request.url}`);
        return request.url === '/api/upload-file'
          ? { matched: true as const, valid: true as const, policy: {} as never }
          : { matched: false as const };
      }),
      handleRequest: vi.fn(async () => {
        order.push('upload');
      }),
    });
    const dispatcher = createServerHttpDispatcher({
      validateRequest: vi.fn(() => {
        order.push('guard');
        return { allowed: true as const };
      }),
      uploadServer,
      fallbackRequest: vi.fn(() => {
        order.push('fallback');
      }),
      fallbackUpgrade: vi.fn(),
    });

    const uploadSocket = new FakeSocket();
    dispatcher.handleRequest(
      createRequest(uploadSocket, '/api/upload-file'),
      asResponse(new FakeResponse(uploadSocket)),
    );
    const ordinarySocket = new FakeSocket();
    dispatcher.handleRequest(
      createRequest(ordinarySocket, '/ordinary'),
      asResponse(new FakeResponse(ordinarySocket)),
    );

    expect(order).toEqual([
      'classify:/api/upload-file',
      'guard',
      'upload',
      'classify:/ordinary',
      'guard',
      'fallback',
    ]);
  });

  it('writes outer rejection JSON, waits for finish, then closes the socket', async () => {
    const uploadServer = createUploadServer();
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => ({ allowed: false, statusCode: 403, reason: 'source-forbidden' }),
      uploadServer,
      fallbackRequest: vi.fn(),
      fallbackUpgrade: vi.fn(),
    });
    const socket = new FakeSocket();
    const response = new FakeResponse(socket);
    let finishCallback: (() => void) | null = null;
    response.end.mockImplementationOnce((chunk?: string | Buffer) => {
      if (chunk !== undefined) response.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      response.headersSent = true;
      response.writableEnded = true;
      finishCallback = () => response.emit('finish');
      return response;
    });

    dispatcher.handleRequest(createRequest(socket, '/api/upload-file'), asResponse(response));
    await vi.waitFor(() => expect(response.end).toHaveBeenCalledTimes(1));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'source-forbidden' });
    expect(response.getHeader('connection')).toBe('close');
    expect(response.getHeader('content-length')).toBe(Buffer.byteLength(JSON.stringify({
      error: 'source-forbidden',
    })));
    expect(socket.end).not.toHaveBeenCalled();

    expect(finishCallback).not.toBeNull();
    (finishCallback as unknown as () => void)();
    await flush();
    expect(socket.end).toHaveBeenCalledTimes(1);
    expect(uploadServer.handleRequest).not.toHaveBeenCalled();
  });

  it('sends one non-upload Continue, removes normalized/raw Expect, then falls back', async () => {
    const order: string[] = [];
    const fallbackRequest = vi.fn(async (request: IncomingMessage) => {
      order.push('fallback');
      expect(request.headers.expect).toBeUndefined();
      expect(request.rawHeaders.map((value) => value.toLowerCase())).not.toContain('expect');
    });
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => {
        order.push('guard');
        return { allowed: true };
      },
      uploadServer: createUploadServer(),
      fallbackRequest,
      fallbackUpgrade: vi.fn(),
    });
    const socket = new FakeSocket();
    const request = createRequest(socket, '/ordinary', [
      'Host', 'localhost:8122',
      'Expect', '100-continue',
    ]);
    const response = new FakeResponse(socket);
    response.writeContinue.mockImplementation(() => {
      order.push('continue');
    });

    expect(dispatcher.handleCheckContinue(request, asResponse(response))).toBeUndefined();
    await flush();

    expect(response.writeContinue).toHaveBeenCalledTimes(1);
    expect(fallbackRequest).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['guard', 'continue', 'fallback']);
  });

  it('routes upload Continue to upload admission without writing an early interim response', async () => {
    const uploadServer = createUploadServer();
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => ({ allowed: true }),
      uploadServer,
      fallbackRequest: vi.fn(),
      fallbackUpgrade: vi.fn(),
    });
    const socket = new FakeSocket();
    const request = createRequest(socket, '/api/upload-file', [
      'Host', 'localhost:8122',
      'Expect', '100-continue',
    ]);
    const response = new FakeResponse(socket);

    dispatcher.handleCheckContinue(request, asResponse(response));
    await flush();

    expect(response.writeContinue).not.toHaveBeenCalled();
    expect(uploadServer.handleRequest).toHaveBeenCalledWith(request, response, {
      expectContinue: true,
    });
  });

  it('routes matched expectation to upload auth and rejects unmatched expectation without fallback', async () => {
    const uploadServer = createUploadServer();
    const fallbackRequest = vi.fn();
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => ({ allowed: true }),
      uploadServer,
      fallbackRequest,
      fallbackUpgrade: vi.fn(),
    });
    const uploadSocket = new FakeSocket();
    const uploadRequest = createRequest(uploadSocket, '/api/upload-file', [
      'Host', 'localhost:8122',
      'Expect', 'unsupported',
    ]);
    dispatcher.handleCheckExpectation(uploadRequest, asResponse(new FakeResponse(uploadSocket)));

    const ordinarySocket = new FakeSocket();
    const ordinaryResponse = new FakeResponse(ordinarySocket);
    dispatcher.handleCheckExpectation(
      createRequest(ordinarySocket, '/ordinary', [
        'Host', 'localhost:8122',
        'Expect', 'unsupported',
      ]),
      asResponse(ordinaryResponse),
    );
    await flush();

    expect(uploadServer.handleRequest).toHaveBeenCalledWith(uploadRequest, expect.anything(), {
      expectContinue: false,
    });
    expect(ordinaryResponse.statusCode).toBe(417);
    expect(ordinaryResponse.getHeader('connection')).toBe('close');
    expect(fallbackRequest).not.toHaveBeenCalled();
  });

  it('runs the outer guard before matched upload upgrade or unmatched fallback', async () => {
    const order: string[] = [];
    const uploadServer = createUploadServer({
      handleUpgradeAttempt: vi.fn(async () => {
        order.push('upload-upgrade');
      }),
    });
    const fallbackUpgrade = vi.fn(async () => {
      order.push('fallback-upgrade');
    });
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => {
        order.push('guard');
        return { allowed: true };
      },
      uploadServer,
      fallbackRequest: vi.fn(),
      fallbackUpgrade,
    });
    const uploadSocket = new FakeSocket();
    const uploadRequest = createRequest(uploadSocket, '/api/upload-file');
    expect(dispatcher.handleUpgrade(uploadRequest, asSocket(uploadSocket), Buffer.alloc(0)))
      .toBeUndefined();
    const fallbackSocket = new FakeSocket();
    dispatcher.handleUpgrade(
      createRequest(fallbackSocket, '/_next/webpack-hmr'),
      asSocket(fallbackSocket),
      Buffer.from('head'),
    );
    await flush();

    expect(order).toEqual(['guard', 'upload-upgrade', 'guard', 'fallback-upgrade']);
    expect(uploadServer.handleUpgradeAttempt).toHaveBeenCalledWith(uploadRequest, uploadSocket);
    expect(fallbackUpgrade).toHaveBeenCalledTimes(1);
  });

  it('tracks every upgraded socket for bounded shutdown and removes closed sockets', () => {
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => ({ allowed: true }),
      uploadServer: createUploadServer(),
      fallbackRequest: vi.fn(),
      fallbackUpgrade: vi.fn(),
    });
    const active = new FakeSocket();
    const alreadyClosed = new FakeSocket();
    dispatcher.handleUpgrade(
      createRequest(active, '/_next/webpack-hmr'),
      asSocket(active),
      Buffer.alloc(0),
    );
    dispatcher.handleUpgrade(
      createRequest(alreadyClosed, '/api/terminal'),
      asSocket(alreadyClosed),
      Buffer.alloc(0),
    );
    alreadyClosed.emit('close');

    expect(dispatcher.terminateUpgradedSockets()).toBeUndefined();
    expect(active.destroy).toHaveBeenCalledTimes(1);
    expect(alreadyClosed.destroy).not.toHaveBeenCalled();
    dispatcher.terminateUpgradedSockets();
    expect(active.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects upgrades synchronously once upgraded socket termination begins', () => {
    const uploadServer = createUploadServer();
    const validateRequest = vi.fn(() => ({ allowed: true as const }));
    const fallbackUpgrade = vi.fn();
    const dispatcher = createServerHttpDispatcher({
      validateRequest,
      uploadServer,
      fallbackRequest: vi.fn(),
      fallbackUpgrade,
    });
    dispatcher.terminateUpgradedSockets();
    const socket = new FakeSocket();

    expect(dispatcher.handleUpgrade(
      createRequest(socket, '/_next/webpack-hmr'),
      asSocket(socket),
      Buffer.alloc(0),
    )).toBeUndefined();

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(uploadServer.classify).not.toHaveBeenCalled();
    expect(validateRequest).not.toHaveBeenCalled();
    expect(fallbackUpgrade).not.toHaveBeenCalled();
    dispatcher.terminateUpgradedSockets();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['request', 'server-http-request-failed'],
    ['upgrade', 'server-http-upgrade-failed'],
  ] as const)('contains async %s rejection with a fixed code and fail-close', async (kind, code) => {
    const failure = new Error('/private/rejection');
    const uploadServer = createUploadServer({
      handleRequest: vi.fn(async () => {
        throw failure;
      }),
      handleUpgradeAttempt: vi.fn(async () => {
        throw failure;
      }),
    });
    const dispatcher = createServerHttpDispatcher({
      validateRequest: () => ({ allowed: true }),
      uploadServer,
      fallbackRequest: vi.fn(async () => {
        throw failure;
      }),
      fallbackUpgrade: vi.fn(async () => {
        throw failure;
      }),
    });
    const socket = new FakeSocket();
    const request = createRequest(socket, kind === 'request' ? '/api/upload-file' : '/ordinary');

    if (kind === 'request') {
      dispatcher.handleRequest(request, asResponse(new FakeResponse(socket)));
    } else {
      dispatcher.handleUpgrade(request, asSocket(socket), Buffer.alloc(0));
    }
    await flush();

    expect(logMocks.error).toHaveBeenCalledWith(code);
    expect(logMocks.error.mock.calls.flat().join(' ')).not.toContain(failure.message);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('outer server lifecycle', () => {
  it('contains an initial synchronous listen throw and removes temporary listeners', async () => {
    const listenError = new Error('initial listen failed');
    const server = new EventEmitter() as EventEmitter & {
      listen: ReturnType<typeof vi.fn>;
      address: ReturnType<typeof vi.fn>;
    };
    server.listen = vi.fn(() => {
      throw listenError;
    });
    server.address = vi.fn(() => null);

    await expect(listenWithFallback(server as never, 8122, '127.0.0.1'))
      .rejects.toBe(listenError);

    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });

  it('contains a synchronous fallback listen throw after EADDRINUSE and cleans listeners', async () => {
    const fallbackError = new Error('fallback listen failed');
    const onPortInUse = vi.fn();
    const server = new EventEmitter() as EventEmitter & {
      listen: ReturnType<typeof vi.fn>;
      address: ReturnType<typeof vi.fn>;
    };
    server.listen = vi.fn()
      .mockReturnValueOnce(server)
      .mockImplementationOnce(() => {
        throw fallbackError;
      });
    server.address = vi.fn(() => null);

    const listening = listenWithFallback(server as never, 8122, '127.0.0.1', onPortInUse);
    const addressInUse = Object.assign(new Error('in use'), { code: 'EADDRINUSE' });
    server.emit('error', addressInUse);

    await expect(listening).rejects.toBe(fallbackError);
    expect(server.listen).toHaveBeenNthCalledWith(1, 8122, '127.0.0.1');
    expect(server.listen).toHaveBeenNthCalledWith(2, 0, '127.0.0.1');
    expect(onPortInUse).toHaveBeenCalledTimes(1);
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });

  it('rejects when the server closes before the pending listen settles', async () => {
    const server = new EventEmitter() as EventEmitter & {
      listen: ReturnType<typeof vi.fn>;
      address: ReturnType<typeof vi.fn>;
    };
    server.listen = vi.fn(() => server);
    server.address = vi.fn(() => null);

    const listening = listenWithFallback(server as never, 8122, '127.0.0.1');
    server.emit('close');
    const outcome = await Promise.race([
      listening.then(
        () => 'resolved',
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 10)),
    ]);

    expect(outcome).toMatchObject({ code: 'ERR_SERVER_NOT_RUNNING' });
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
    expect(server.listenerCount('close')).toBe(0);
  });

  it('starts close immediately and drains shutdown stages before awaiting its callback', async () => {
    const order: string[] = [];
    const uploadShutdown = deferred<void>();
    let closeCallback: ((error?: Error) => void) | null = null;
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        order.push('close-start');
        closeCallback = callback;
      }),
    };
    const uploadServer = createUploadServer({
      beginShutdown: vi.fn(() => {
        order.push('begin');
      }),
      shutdown: vi.fn(() => {
        order.push('upload');
        return uploadShutdown.promise;
      }),
    });
    const lifecycle = createOuterServerLifecycle({
      server: server as never,
      uploadServer,
      listen: vi.fn(async () => 8122),
      shutdownRuntime: vi.fn(async () => {
        order.push('runtime');
      }),
      shutdownWebSockets: vi.fn(async () => {
        order.push('websockets');
      }),
      waitForUpgradeGrace: vi.fn(async () => {
        order.push('grace');
      }),
      terminateWebSocketClients: vi.fn(() => {
        order.push('terminate-clients');
      }),
      terminateUpgradedSockets: vi.fn(() => {
        order.push('terminate-sockets');
      }),
    });

    const first = lifecycle.shutdown();
    const second = lifecycle.shutdown();
    expect(second).toBe(first);
    expect(order).toEqual(['begin', 'close-start', 'upload']);

    uploadShutdown.resolve();
    await flush();
    expect(order).toEqual([
      'begin',
      'close-start',
      'upload',
      'runtime',
      'websockets',
      'grace',
      'terminate-clients',
      'terminate-sockets',
    ]);
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    expect(closeCallback).not.toBeNull();
    (closeCallback as unknown as () => void)();
    await first;
    expect(settled).toBe(true);
  });

  it('attempts every shutdown stage and rejects with the first error', async () => {
    const firstError = new Error('begin failed');
    const order: string[] = [];
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        order.push('close');
        callback(new Error('close failed'));
      }),
    };
    const lifecycle = createOuterServerLifecycle({
      server: server as never,
      uploadServer: createUploadServer({
        beginShutdown: vi.fn(() => {
          order.push('begin');
          throw firstError;
        }),
        shutdown: vi.fn(async () => {
          order.push('upload');
          throw new Error('upload failed');
        }),
      }),
      listen: vi.fn(async () => 8122),
      shutdownRuntime: vi.fn(async () => {
        order.push('runtime');
        throw new Error('runtime failed');
      }),
      shutdownWebSockets: vi.fn(async () => {
        order.push('websockets');
        throw new Error('websockets failed');
      }),
      waitForUpgradeGrace: vi.fn(async () => {
        order.push('grace');
        throw new Error('grace failed');
      }),
      terminateWebSocketClients: vi.fn(() => {
        order.push('terminate-clients');
        throw new Error('client termination failed');
      }),
      terminateUpgradedSockets: vi.fn(() => {
        order.push('terminate-sockets');
        throw new Error('socket termination failed');
      }),
    });

    await expect(lifecycle.shutdown()).rejects.toBe(firstError);

    expect(order).toEqual([
      'begin',
      'close',
      'upload',
      'runtime',
      'websockets',
      'grace',
      'terminate-clients',
      'terminate-sockets',
    ]);
  });

  it('starts upload maintenance before listen and rolls back listen failure', async () => {
    const order: string[] = [];
    const listenError = new Error('listen failed');
    const uploadServer = createUploadServer({
      start: vi.fn(async () => {
        order.push('upload-start');
      }),
      beginShutdown: vi.fn(() => {
        order.push('begin');
      }),
      shutdown: vi.fn(async () => {
        order.push('upload-shutdown');
      }),
    });
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => callback()),
    };
    const lifecycle = createOuterServerLifecycle({
      server: server as never,
      uploadServer,
      listen: vi.fn(async () => {
        order.push('listen');
        throw listenError;
      }),
      shutdownRuntime: vi.fn(async () => {
        order.push('runtime');
      }),
      shutdownWebSockets: vi.fn(async () => {
        order.push('websockets');
      }),
      waitForUpgradeGrace: vi.fn(async () => {
        order.push('grace');
      }),
      terminateWebSocketClients: vi.fn(() => {
        order.push('terminate-clients');
      }),
      terminateUpgradedSockets: vi.fn(() => {
        order.push('terminate-sockets');
      }),
    });

    await expect(lifecycle.start()).rejects.toBe(listenError);

    expect(order).toEqual([
      'upload-start',
      'listen',
      'begin',
      'upload-shutdown',
      'runtime',
      'websockets',
      'grace',
      'terminate-clients',
      'terminate-sockets',
    ]);
  });

  it('publishes the start promise before upload startup can reenter it', async () => {
    let reentered = false;
    let nestedStart: Promise<number> | null = null;
    const uploadServer = createUploadServer({
      start: vi.fn(() => {
        if (!reentered) {
          reentered = true;
          nestedStart = lifecycle.start();
        }
        return Promise.resolve();
      }),
    });
    const listen = vi.fn(async () => 8122);
    const lifecycle = createOuterServerLifecycle({
      server: { close: vi.fn((callback: () => void) => callback()) } as never,
      uploadServer,
      listen,
      shutdownRuntime: vi.fn(),
      shutdownWebSockets: vi.fn(),
      waitForUpgradeGrace: vi.fn(),
      terminateWebSocketClients: vi.fn(),
      terminateUpgradedSockets: vi.fn(),
    });

    const initialStart = lifecycle.start();
    await vi.waitFor(() => expect(nestedStart).not.toBeNull());

    expect(nestedStart).toBe(initialStart);
    await expect(initialStart).resolves.toBe(8122);
    expect(uploadServer.start).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it('does not start listening after shutdown has begun', async () => {
    const uploadServer = createUploadServer();
    const listen = vi.fn(async () => 8122);
    const lifecycle = createOuterServerLifecycle({
      server: { close: vi.fn((callback: () => void) => callback()) } as never,
      uploadServer,
      listen,
      shutdownRuntime: vi.fn(),
      shutdownWebSockets: vi.fn(),
      waitForUpgradeGrace: vi.fn(),
      terminateWebSocketClients: vi.fn(),
      terminateUpgradedSockets: vi.fn(),
    });

    await lifecycle.shutdown();
    await expect(lifecycle.start()).rejects.toThrow('outer server is shutting down');

    expect(uploadServer.start).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it('rejects restart after a completed start has been shut down', async () => {
    const uploadServer = createUploadServer();
    const listen = vi.fn(async () => 8122);
    const lifecycle = createOuterServerLifecycle({
      server: { close: vi.fn((callback: () => void) => callback()) } as never,
      uploadServer,
      listen,
      shutdownRuntime: vi.fn(),
      shutdownWebSockets: vi.fn(),
      waitForUpgradeGrace: vi.fn(),
      terminateWebSocketClients: vi.fn(),
      terminateUpgradedSockets: vi.fn(),
    });

    await expect(lifecycle.start()).resolves.toBe(8122);
    await lifecycle.shutdown();
    await expect(lifecycle.start()).rejects.toThrow('outer server is shutting down');

    expect(uploadServer.start).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it('does not finish shutdown until a late listener has been closed', async () => {
    const pendingListen = deferred<number>();
    const server = {
      listening: false,
      close: vi.fn((callback: (error?: Error) => void) => {
        server.listening = false;
        callback();
      }),
    };
    const listen = vi.fn(() => pendingListen.promise.then((port) => {
      server.listening = true;
      return port;
    }));
    const lifecycle = createOuterServerLifecycle({
      server: server as never,
      uploadServer: createUploadServer(),
      listen,
      shutdownRuntime: vi.fn(),
      shutdownWebSockets: vi.fn(),
      waitForUpgradeGrace: vi.fn(),
      terminateWebSocketClients: vi.fn(),
      terminateUpgradedSockets: vi.fn(),
    });
    const starting = lifecycle.start();
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(1));

    const shuttingDown = lifecycle.shutdown();
    let shutdownSettled = false;
    void shuttingDown.then(() => {
      shutdownSettled = true;
    });
    await flush();

    expect(shutdownSettled).toBe(false);
    pendingListen.resolve(8122);

    await expect(starting).rejects.toThrow('outer server is shutting down');
    await shuttingDown;
    expect(server.close).toHaveBeenCalledTimes(2);
    expect(server.listening).toBe(false);
    expect(shutdownSettled).toBe(true);
  });
});
