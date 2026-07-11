import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerOptions,
} from 'http';
import { createConnection } from 'net';
import type { Duplex, Readable } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUploadAdmissionService } from '@/lib/upload-admission';
import {
  createOuterServerLifecycle,
  createServerHttpDispatcher,
  type IServerHttpDispatcher,
} from '@/lib/server-http-dispatcher';
import { createUploadServer, type IUploadClock, type IUploadServer } from '@/lib/upload-server';
import type {
  IStreamUploadArtifactInput,
  TUploadTransactionResult,
} from '@/lib/uploads-store';

const clock: IUploadClock = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

const streamReceipt = async (
  input: IStreamUploadArtifactInput,
): Promise<TUploadTransactionResult> => {
  let observedBytes = 0;
  for await (const chunk of input.source as unknown as Readable) {
    observedBytes += Buffer.byteLength(chunk as Buffer);
    input.onProgress();
  }
  if (input.signal.aborted) {
    return {
      committed: false,
      statusCode: input.signal.reason === 'upload-server-shutting-down' ? 503 : 400,
      reason: input.signal.reason === 'upload-server-shutting-down'
        ? 'upload-server-shutting-down'
        : 'upload-aborted',
      cleanup: 'not-required',
    };
  }
  if (observedBytes !== input.declaredBytes || !input.source.complete) {
    return {
      committed: false,
      statusCode: 400,
      reason: 'length-mismatch',
      cleanup: 'not-required',
    };
  }
  return {
    committed: true,
    receipt: { path: '/safe/upload.bin', filename: 'upload.bin' },
  };
};

interface IIngressHarness {
  server: Server;
  port: number;
  uploadServer: IUploadServer;
  authorizeRequest: ReturnType<typeof vi.fn>;
  streamArtifact: ReturnType<typeof vi.fn>;
  fallbackRequest: ReturnType<typeof vi.fn>;
  fallbackUpgrade: ReturnType<typeof vi.fn>;
  validateRequest: ReturnType<typeof vi.fn>;
  admission: ReturnType<typeof createUploadAdmissionService>;
  dispatcher: IServerHttpDispatcher;
  close: () => Promise<void>;
}

const activeHarnesses: IIngressHarness[] = [];

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    });
  });

const createIngressHarness = async (options: {
  disabled?: boolean;
  guard?: () =>
    | { allowed: true }
    | { allowed: false; statusCode: 403; reason: 'source-forbidden' };
  serverOptions?: ServerOptions;
  streamArtifact?: (
    input: IStreamUploadArtifactInput,
  ) => Promise<TUploadTransactionResult>;
  fallbackUpgrade?: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void | Promise<void>;
  uploadUpgradeAttempt?: (
    request: IncomingMessage,
    socket: Duplex,
  ) => Promise<void>;
} = {}): Promise<IIngressHarness> => {
  const authorizeRequest = vi.fn(async () => ({
    authorized: true as const,
    credential: { kind: 'cli' as const },
    refreshSession: false as const,
  }));
  const streamArtifact = vi.fn(options.streamArtifact ?? streamReceipt);
  const admission = createUploadAdmissionService();
  const baseUploadServer = createUploadServer({
    authorizeRequest,
    admission,
    streamArtifact,
    createSessionRefreshHeader: vi.fn(async () => 'session=refresh'),
    cleanupStaleParts: vi.fn(async () => ({ deleted: 0, freedBytes: 0 })),
    clock,
    disabled: options.disabled ?? false,
  });
  const uploadServer: IUploadServer = options.uploadUpgradeAttempt
    ? { ...baseUploadServer, handleUpgradeAttempt: options.uploadUpgradeAttempt }
    : baseUploadServer;
  const fallbackRequest = vi.fn((request, response) => {
    request.resume();
    response.statusCode = 204;
    response.setHeader('Connection', 'close');
    response.end();
  });
  const fallbackUpgrade = vi.fn(options.fallbackUpgrade ?? ((_request, socket) => {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }));
  const validateRequest = vi.fn(options.guard ?? (() => ({ allowed: true as const })));
  const dispatcher = createServerHttpDispatcher({
    validateRequest,
    uploadServer,
    fallbackRequest,
    fallbackUpgrade,
  });
  const server = createServer(options.serverOptions ?? {});
  server.on('request', dispatcher.handleRequest);
  server.on('checkContinue', dispatcher.handleCheckContinue);
  server.on('checkExpectation', dispatcher.handleCheckExpectation);
  server.on('upgrade', dispatcher.handleUpgrade);
  await uploadServer.start();
  const port = await listen(server);
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    uploadServer.beginShutdown();
    dispatcher.terminateUpgradedSockets();
    server.closeAllConnections();
    const closing = server.listening
      ? new Promise<void>((resolve) => server.close(() => resolve()))
      : Promise.resolve();
    await uploadServer.shutdown();
    await closing;
  };
  const harness = {
    server,
    port,
    uploadServer,
    authorizeRequest,
    streamArtifact,
    fallbackRequest,
    fallbackUpgrade,
    validateRequest,
    admission,
    dispatcher,
    close,
  };
  activeHarnesses.push(harness);
  return harness;
};

const exchangeRaw = (
  port: number,
  payload: string,
  timeoutMs: number = 2_000,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const timeout = setTimeout(() => {
      socket.destroy();
      finish(new Error('raw exchange timed out'));
    }, timeoutMs);
    timeout.unref();
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') finish(error);
    });
    socket.on('close', () => finish());
  });

const within = async <T>(
  operation: Promise<T>,
  timeoutMs: number = 1_000,
  label: string = 'operation',
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded deadline`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

afterEach(async () => {
  const harnesses = activeHarnesses.splice(0);
  await Promise.all(harnesses.map((harness) => harness.close()));
});

describe('real upload HTTP ingress', () => {
  it('composes dev and production through the shared callback-less dispatcher lifecycle', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'server.ts'), 'utf8');

    expect(source).toContain('createServerHttpDispatcher');
    expect(source).toContain('createOuterServerLifecycle');
    expect(source).toContain("server.on('request', dispatcher.handleRequest)");
    expect(source).toContain("server.on('checkContinue', dispatcher.handleCheckContinue)");
    expect(source).toContain("server.on('checkExpectation', dispatcher.handleCheckExpectation)");
    expect(source).toContain("server.on('upgrade', dispatcher.handleUpgrade)");
    expect(source).not.toMatch(/createServer\s*\(\s*\(req, res\)/);
    expect(source).not.toContain("server.on('connect'");

    const manualSignalGuard = source.indexOf("process.env.NEXT_MANUAL_SIG_HANDLE = 'true'");
    const standaloneStart = source.indexOf('require(standalonePath)');
    expect(manualSignalGuard).toBeGreaterThan(-1);
    expect(standaloneStart).toBeGreaterThan(manualSignalGuard);
  });

  it('has no Pages Router fallback for either outer-owned upload path', async () => {
    const routeFiles = [
      'src/pages/api/upload-image.ts',
      'src/pages/api/upload-file.ts',
    ];

    for (const routeFile of routeFiles) {
      await expect(fs.stat(path.join(process.cwd(), routeFile))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  });

  it('owns exact upload before fallback and closes a successful response', async () => {
    const harness = await createIngressHarness();

    const response = await exchangeRaw(harness.port, [
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      'Content-Length: 1',
      'Connection: keep-alive',
      '',
      'x',
    ].join('\r\n'));

    expect(response).toContain('HTTP/1.1 200 OK');
    expect(response).toContain('Connection: close');
    expect(response).toContain('{"path":"/safe/upload.bin","filename":"upload.bin"}');
    expect(harness.streamArtifact).toHaveBeenCalledTimes(1);
    expect(harness.fallbackRequest).not.toHaveBeenCalled();
  });

  it('runs the outer guard before ordinary fallback and upload authentication', async () => {
    const rejected = await createIngressHarness({
      guard: () => ({ allowed: false, statusCode: 403, reason: 'source-forbidden' }),
    });

    const ordinary = await exchangeRaw(rejected.port, [
      'GET /ordinary HTTP/1.1',
      'Host: localhost',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));
    const uploadExpect = await exchangeRaw(rejected.port, [
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      'Content-Length: 1',
      'Expect: 100-continue',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));

    expect(ordinary).toContain('HTTP/1.1 403 Forbidden');
    expect(ordinary).toContain('{"error":"source-forbidden"}');
    expect(uploadExpect).toContain('HTTP/1.1 403 Forbidden');
    expect(uploadExpect).not.toContain('100 Continue');
    expect(rejected.authorizeRequest).not.toHaveBeenCalled();
    expect(rejected.fallbackRequest).not.toHaveBeenCalled();
  });

  it('sends exactly one Continue for non-upload and auth-first 417 for upload', async () => {
    const harness = await createIngressHarness();

    const ordinary = await exchangeRaw(harness.port, [
      'POST /ordinary HTTP/1.1',
      'Host: localhost',
      'Content-Length: 0',
      'Expect: 100-continue',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));
    const upload = await exchangeRaw(harness.port, [
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      'Content-Length: 1',
      'Expect: unsupported',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));

    expect(ordinary.match(/HTTP\/1\.1 100 Continue/g)).toHaveLength(1);
    expect(ordinary).toContain('HTTP/1.1 204 No Content');
    expect(upload).toContain('HTTP/1.1 417 Expectation Failed');
    expect(harness.authorizeRequest).toHaveBeenCalledTimes(1);
    expect(harness.streamArtifact).not.toHaveBeenCalled();
  });

  it('preserves non-upload checkExpectation as 417 without fallback', async () => {
    const harness = await createIngressHarness();

    const response = await exchangeRaw(harness.port, [
      'GET /ordinary HTTP/1.1',
      'Host: localhost',
      'Expect: unsupported',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));

    expect(response).toContain('HTTP/1.1 417 Expectation Failed');
    expect(harness.fallbackRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate Content-Length', ['Content-Length: 1', 'Content-Length: 1']],
    ['Content-Length plus Transfer-Encoding', ['Content-Length: 1', 'Transfer-Encoding: chunked']],
  ])('lets Node reject %s before application dispatch', async (_name, framing) => {
    const harness = await createIngressHarness();

    const response = await exchangeRaw(harness.port, [
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      ...framing,
      'Connection: close',
      '',
      'x',
    ].join('\r\n'));

    expect(response).toContain('HTTP/1.1 400 Bad Request');
    expect(harness.validateRequest).not.toHaveBeenCalled();
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expect(harness.fallbackRequest).not.toHaveBeenCalled();
  });

  it('quarantines pipelined octets without disrupting the first upload response', async () => {
    const harness = await createIngressHarness();

    const response = await exchangeRaw(harness.port, [
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      'Content-Length: 1',
      'Connection: keep-alive',
      '',
      'xGET /ordinary HTTP/1.1',
      'Host: localhost',
      'Connection: close',
      '',
      '',
    ].join('\r\n'));

    expect(response).toContain('HTTP/1.1 200 OK');
    expect(response).not.toContain('204 No Content');
    expect(harness.fallbackRequest).not.toHaveBeenCalled();
  });

  it.each(['/api/upload-file', '/api/./upload-file'])(
    'owns authenticated upgrade target %s before fallback',
    async (target) => {
      const harness = await createIngressHarness();

      const response = await exchangeRaw(harness.port, [
        `GET ${target} HTTP/1.1`,
        'Host: localhost',
        'Connection: Upgrade',
        'Upgrade: websocket',
        '',
        '',
      ].join('\r\n'));

      expect(response).toContain('HTTP/1.1 400 Bad Request');
      expect(harness.validateRequest).toHaveBeenCalledTimes(1);
      expect(harness.fallbackUpgrade).not.toHaveBeenCalled();
    },
  );

  it('keeps CONNECT fail-closed without application dispatch', async () => {
    const harness = await createIngressHarness();

    await exchangeRaw(harness.port, [
      'CONNECT localhost:8122 HTTP/1.1',
      'Host: localhost:8122',
      '',
      '',
    ].join('\r\n'));

    expect(harness.validateRequest).not.toHaveBeenCalled();
    expect(harness.fallbackRequest).not.toHaveBeenCalled();
    expect(harness.fallbackUpgrade).not.toHaveBeenCalled();
  });

  it('times out slow headers before admission or storage', async () => {
    const harness = await createIngressHarness({
      serverOptions: {
        headersTimeout: 40,
        requestTimeout: 40,
        connectionsCheckingInterval: 10,
      },
    });

    const response = await exchangeRaw(
      harness.port,
      'POST /api/upload-file HTTP/1.1\r\nHost: localhost',
      1_000,
    );

    expect(response).toContain('HTTP/1.1 408 Request Timeout');
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expect(harness.streamArtifact).not.toHaveBeenCalled();
  });

  it('returns disabled 503 without falling through', async () => {
    const harness = await createIngressHarness({ disabled: true });

    const response = await exchangeRaw(harness.port, [
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      'Content-Length: 1',
      'Connection: close',
      '',
      'x',
    ].join('\r\n'));

    expect(response).toContain('HTTP/1.1 503 Service Unavailable');
    expect(harness.fallbackRequest).not.toHaveBeenCalled();
    expect(harness.streamArtifact).not.toHaveBeenCalled();
  });

  it('contains injected asynchronous upload rejection without an unhandled promise', async () => {
    const failure = new Error('injected upload rejection');
    const harness = await createIngressHarness({
      streamArtifact: async () => {
        throw failure;
      },
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await exchangeRaw(harness.port, [
        'POST /api/upload-file HTTP/1.1',
        'Host: localhost',
        'Content-Length: 1',
        'Connection: close',
        '',
        'x',
      ].join('\r\n'));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it.each(['upload', 'fallback'] as const)(
    'contains injected asynchronous %s upgrade rejection without an unhandled promise',
    async (kind) => {
      const failure = new Error(`injected ${kind} upgrade rejection`);
      const uploadUpgradeAttempt = vi.fn(async () => {
        throw failure;
      });
      const fallbackUpgrade = vi.fn(async () => {
        throw failure;
      });
      const harness = await createIngressHarness({
        ...(kind === 'upload' ? { uploadUpgradeAttempt } : { fallbackUpgrade }),
      });
      const unhandled: unknown[] = [];
      const onUnhandled = (error: unknown): void => {
        unhandled.push(error);
      };
      process.on('unhandledRejection', onUnhandled);
      try {
        await exchangeRaw(harness.port, [
          `GET ${kind === 'upload' ? '/api/upload-file' : '/_next/webpack-hmr'} HTTP/1.1`,
          'Host: localhost',
          'Connection: Upgrade',
          'Upgrade: websocket',
          '',
          '',
        ].join('\r\n'));
        await new Promise((resolve) => setImmediate(resolve));

        expect(unhandled).toEqual([]);
        if (kind === 'upload') {
          expect(uploadUpgradeAttempt).toHaveBeenCalledTimes(1);
          expect(fallbackUpgrade).not.toHaveBeenCalled();
        } else {
          expect(fallbackUpgrade).toHaveBeenCalledTimes(1);
          expect(uploadUpgradeAttempt).not.toHaveBeenCalled();
        }
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    },
  );

  it('terminates an active upgraded socket before awaiting the HTTP close callback', async () => {
    const fallbackUpgrade = vi.fn(() => undefined);
    const harness = await createIngressHarness({ fallbackUpgrade });
    const client = createConnection({ host: '127.0.0.1', port: harness.port });
    client.on('error', () => undefined);
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()));
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));
    client.write([
      'GET /_next/webpack-hmr HTTP/1.1',
      'Host: localhost',
      'Connection: Upgrade',
      'Upgrade: websocket',
      '',
      '',
    ].join('\r\n'));
    await vi.waitFor(() => expect(fallbackUpgrade).toHaveBeenCalledTimes(1));
    const lifecycle = createOuterServerLifecycle({
      server: harness.server,
      uploadServer: harness.uploadServer,
      listen: vi.fn(async () => harness.port),
      shutdownRuntime: vi.fn(),
      shutdownWebSockets: vi.fn(),
      waitForUpgradeGrace: () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
      terminateWebSocketClients: vi.fn(),
      terminateUpgradedSockets: harness.dispatcher.terminateUpgradedSockets,
    });

    const shutdown = lifecycle.shutdown();
    await vi.waitFor(() => expect(harness.admission.getSnapshot()).toEqual({
      activeUploads: 0,
      reservedBytes: 0,
      shuttingDown: true,
    }));
    await within(shutdown, 1_000, 'upgrade shutdown');
    await within(closed, 1_000, 'upgrade client close');
  });

  it('aborts a stalled admitted upload and closes within the shutdown deadline', async () => {
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) =>
      new Promise<TUploadTransactionResult>((resolve) => {
        input.signal.addEventListener('abort', () => {
          resolve({
            committed: false,
            statusCode: 503,
            reason: 'upload-server-shutting-down',
            cleanup: 'complete',
          });
        }, { once: true });
      }));
    const harness = await createIngressHarness({ streamArtifact });
    const client = createConnection({ host: '127.0.0.1', port: harness.port });
    client.on('error', () => undefined);
    client.resume();
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()));
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));
    client.write([
      'POST /api/upload-file HTTP/1.1',
      'Host: localhost',
      'Content-Length: 100',
      'Connection: keep-alive',
      '',
      'x',
    ].join('\r\n'));
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    const order: string[] = [];
    const uploadShutdown = harness.uploadServer.shutdown;
    const closeAllConnections = vi.spyOn(harness.server, 'closeAllConnections');
    const lifecycle = createOuterServerLifecycle({
      server: harness.server,
      uploadServer: {
        ...harness.uploadServer,
        shutdown: vi.fn(async () => {
          order.push('upload-start');
          await uploadShutdown();
          order.push('upload-end');
        }),
      },
      listen: vi.fn(async () => harness.port),
      shutdownRuntime: vi.fn(),
      shutdownWebSockets: vi.fn(),
      waitForUpgradeGrace: vi.fn(),
      terminateWebSocketClients: vi.fn(),
      terminateUpgradedSockets: () => {
        order.push('terminate-upgrades');
        harness.dispatcher.terminateUpgradedSockets();
      },
    });

    const shutdown = lifecycle.shutdown();
    await vi.waitFor(() => expect(harness.admission.getSnapshot()).toEqual({
      activeUploads: 0,
      reservedBytes: 0,
      shuttingDown: true,
    }));
    await vi.waitFor(() => expect(order).toContain('upload-end'));
    await vi.waitFor(() => expect(closeAllConnections).toHaveBeenCalledTimes(1));
    await within(shutdown, 1_000, 'stalled shutdown');
    await within(closed, 1_000, 'stalled client close');
    expect(harness.admission.getSnapshot()).toEqual({
      activeUploads: 0,
      reservedBytes: 0,
      shuttingDown: true,
    });
  });
});
