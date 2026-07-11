import type { IncomingMessage, Server, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { createLogger } from '@/lib/logger';
import type { TUpgradeRequestGuardResult } from '@/lib/runtime/server-ws-upgrade';
import type { IUploadServer } from '@/lib/upload-server';

export interface IServerHttpDispatcherOptions {
  validateRequest: (request: IncomingMessage) => TUpgradeRequestGuardResult;
  uploadServer: IUploadServer;
  fallbackRequest: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>;
  fallbackUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void | Promise<void>;
}

export interface IServerHttpDispatcher {
  handleRequest: (request: IncomingMessage, response: ServerResponse) => void;
  handleCheckContinue: (request: IncomingMessage, response: ServerResponse) => void;
  handleCheckExpectation: (request: IncomingMessage, response: ServerResponse) => void;
  handleUpgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  terminateUpgradedSockets: () => void;
}

export interface IOuterServerLifecycleOptions<TListenResult> {
  server: Server;
  uploadServer: IUploadServer;
  listen: () => TListenResult | Promise<TListenResult>;
  shutdownRuntime: () => void | Promise<void>;
  shutdownWebSockets: () => void | Promise<void>;
  waitForUpgradeGrace: () => void | Promise<void>;
  terminateWebSocketClients: () => void;
  terminateUpgradedSockets: () => void;
}

export interface IOuterServerLifecycle<TListenResult> {
  start: () => Promise<TListenResult>;
  shutdown: () => Promise<void>;
}

type TRequestFailureCode = 'server-http-request-failed' | 'server-http-upgrade-failed';
type TRouteMatch = ReturnType<IUploadServer['classify']>;

const log = createLogger('server-http-dispatcher');

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  415: 'Unsupported Media Type',
  417: 'Expectation Failed',
  503: 'Service Unavailable',
};

const isServerNotRunningError = (error: unknown): boolean =>
  error instanceof Error
  && 'code' in error
  && (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING';

export const listenWithFallback = (
  server: Server,
  port: number,
  host: string,
  onPortInUse: () => void = () => undefined,
): Promise<number> => new Promise((resolve, reject) => {
  let triedFallback = false;
  let settled = false;
  const cleanup = (): void => {
    server.off('error', onError);
    server.off('listening', onListening);
    server.off('close', onClose);
  };
  const fail = (error: unknown): void => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(error);
  };
  const tryListen = (listenPort: number): void => {
    try {
      server.listen(listenPort, host);
    } catch (error) {
      fail(error);
    }
  };
  const onListening = (): void => {
    if (settled) return;
    const address = server.address();
    if (!address || typeof address === 'string') {
      fail(new Error('HTTP server has no TCP address after listening'));
      return;
    }
    settled = true;
    cleanup();
    resolve(address.port);
  };
  const onError = (error: NodeJS.ErrnoException): void => {
    if (error.code === 'EADDRINUSE' && !triedFallback) {
      triedFallback = true;
      try {
        onPortInUse();
      } catch (callbackError) {
        fail(callbackError);
        return;
      }
      tryListen(0);
      return;
    }
    fail(error);
  };
  const onClose = (): void => {
    fail(Object.assign(
      new Error('HTTP server closed before listening'),
      { code: 'ERR_SERVER_NOT_RUNNING' },
    ));
  };
  server.on('error', onError);
  server.on('listening', onListening);
  server.on('close', onClose);
  tryListen(port);
});

export const createOuterServerLifecycle = <TListenResult>(
  options: IOuterServerLifecycleOptions<TListenResult>,
): IOuterServerLifecycle<TListenResult> => {
  let startPromise: Promise<TListenResult> | null = null;
  let shutdownPromise: Promise<void> | null = null;
  let shuttingDown = false;
  let listenAttempt: Promise<void> | null = null;
  let listenSettled = true;

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    let resolveShutdown = (): void => undefined;
    let rejectShutdown = (_error: unknown): void => undefined;
    const publishedPromise = new Promise<void>((resolve, reject) => {
      resolveShutdown = resolve;
      rejectShutdown = reject;
    });
    shutdownPromise = publishedPromise;
    shuttingDown = true;
    const pendingListen = listenSettled ? null : listenAttempt;

    let firstError: unknown;
    let hasError = false;
    const recordError = (error: unknown): void => {
      if (hasError || isServerNotRunningError(error)) return;
      hasError = true;
      firstError = error;
    };
    try {
      options.uploadServer.beginShutdown();
    } catch (error) {
      recordError(error);
    }

    const closeServer = (): Promise<void> => new Promise<void>((resolve) => {
      try {
        options.server.close((error?: Error) => {
          if (error) recordError(error);
          resolve();
        });
      } catch (error) {
        recordError(error);
        resolve();
      }
    });
    const closeResult = closeServer();

    const task = (async () => {
      const attempt = async (operation: () => void | Promise<void>): Promise<void> => {
        try {
          await operation();
        } catch (error) {
          recordError(error);
        }
      };
      await attempt(options.uploadServer.shutdown);
      await attempt(options.shutdownRuntime);
      await attempt(options.shutdownWebSockets);
      await attempt(options.waitForUpgradeGrace);
      await attempt(options.terminateWebSocketClients);
      await attempt(options.terminateUpgradedSockets);
      if (typeof options.server.closeAllConnections === 'function') {
        await attempt(() => options.server.closeAllConnections());
      }
      if (pendingListen) {
        await pendingListen;
        const lateCloseResult = closeServer();
        if (typeof options.server.closeAllConnections === 'function') {
          await attempt(() => options.server.closeAllConnections());
        }
        await lateCloseResult;
      }
      await closeResult;
      if (hasError) throw firstError;
    })();
    void task.then(resolveShutdown, rejectShutdown);
    return publishedPromise;
  };

  const start = (): Promise<TListenResult> => {
    if (shuttingDown) return Promise.reject(new Error('outer server is shutting down'));
    if (startPromise) return startPromise;
    let resolveStart = (_value: TListenResult): void => undefined;
    let rejectStart = (_error: unknown): void => undefined;
    const publishedPromise = new Promise<TListenResult>((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });
    startPromise = publishedPromise;
    const task = (async () => {
      try {
        await options.uploadServer.start();
        if (shuttingDown) throw new Error('outer server is shutting down');
        listenSettled = false;
        const currentListen = Promise.resolve().then(options.listen);
        listenAttempt = currentListen.then(
          () => undefined,
          () => undefined,
        );
        let result: TListenResult;
        try {
          result = await currentListen;
        } finally {
          listenSettled = true;
        }
        if (shuttingDown) throw new Error('outer server is shutting down');
        return result;
      } catch (error) {
        try {
          await shutdown();
        } catch {
          // Startup reports the operation that triggered rollback.
        }
        throw error;
      }
    })();
    void task.then(resolveStart, rejectStart);
    return publishedPromise;
  };

  return { start, shutdown };
};

const safeDestroySocket = (socket: Duplex | null): void => {
  if (!socket || socket.destroyed) return;
  try {
    socket.destroy();
  } catch {
    // Transport cleanup is best effort at the event boundary.
  }
};

const safeCloseSocket = (socket: Duplex | null): void => {
  if (!socket || socket.destroyed) return;
  if (socket.writable === false) {
    safeDestroySocket(socket);
    return;
  }
  try {
    socket.end();
  } catch {
    safeDestroySocket(socket);
  }
};

const reportFailure = (code: TRequestFailureCode, socket: Duplex | null): void => {
  try {
    log.error(code);
  } catch {
    // Logging cannot break fail-closed transport cleanup.
  }
  safeDestroySocket(socket);
};

const contain = (
  operation: Promise<void>,
  code: TRequestFailureCode,
  socket: Duplex | null,
): void => {
  void operation.catch(() => reportFailure(code, socket));
};

const writeResponseAndClose = async (
  response: ServerResponse,
  statusCode: number,
  body: object | null,
): Promise<void> => {
  const socket = response.socket;
  if (
    response.headersSent
    || response.writableEnded
    || response.destroyed
    || !socket
    || socket.destroyed
  ) {
    safeDestroySocket(socket);
    return;
  }

  const payload = body === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  let settle = (): void => undefined;
  const completion = new Promise<void>((resolve) => {
    let settled = false;
    settle = (): void => {
      if (settled) return;
      settled = true;
      response.off('finish', settle);
      response.off('close', settle);
      response.off('error', settle);
      resolve();
    };
    response.once('finish', settle);
    response.once('close', settle);
    response.once('error', settle);
  });

  try {
    response.statusCode = statusCode;
    if (body !== null) response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Length', payload.length);
    response.setHeader('Connection', 'close');
    response.end(payload);
  } catch {
    settle();
    safeDestroySocket(socket);
    return;
  }
  await completion;
  safeCloseSocket(socket);
};

const writeRawGuardRejection = (
  socket: Duplex,
  statusCode: number,
  reason: string,
): Promise<void> => {
  if (socket.destroyed) return Promise.resolve();
  if (socket.writable === false) {
    safeDestroySocket(socket);
    return Promise.resolve();
  }
  const payload = Buffer.from(JSON.stringify({ error: reason }));
  const statusText = STATUS_TEXT[statusCode] ?? 'Error';
  const head = [
    `HTTP/1.1 ${statusCode} ${statusText}`,
    'Content-Type: application/json',
    `Content-Length: ${payload.length}`,
    'Connection: close',
    '',
    '',
  ].join('\r\n');
  const response = Buffer.concat([Buffer.from(head), payload]);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      socket.off('error', settle);
      socket.off('close', settle);
      safeDestroySocket(socket);
      resolve();
    };
    const finishWrite = (error?: Error | null): void => {
      if (error) return;
      settle();
    };
    socket.once('error', settle);
    socket.once('close', settle);
    try {
      socket.end(response, finishWrite);
    } catch {
      settle();
    }
  });
};

const removeExpectHeader = (request: IncomingMessage): void => {
  delete request.headers.expect;
  const retained: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === 'expect') continue;
    retained.push(request.rawHeaders[index], request.rawHeaders[index + 1] ?? '');
  }
  request.rawHeaders.splice(0, request.rawHeaders.length, ...retained);
};

export const createServerHttpDispatcher = (
  options: IServerHttpDispatcherOptions,
): IServerHttpDispatcher => {
  const owners = new WeakMap<Duplex, IncomingMessage>();
  const upgradedSockets = new Set<Duplex>();
  let terminatingUpgrades = false;

  const preflight = (
    request: IncomingMessage,
    socket: Duplex,
    failureCode: TRequestFailureCode,
  ): TRouteMatch | null => {
    const owner = owners.get(socket);
    if (owner && owner !== request) {
      request.pause();
      return null;
    }

    let route: TRouteMatch;
    try {
      route = options.uploadServer.classify(request);
    } catch {
      reportFailure(failureCode, socket);
      return null;
    }
    if (route.matched && !owner) {
      owners.set(socket, request);
      const release = (): void => {
        if (owners.get(socket) === request) owners.delete(socket);
      };
      socket.once('close', release);
    }
    return route;
  };

  const dispatchRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    route: TRouteMatch,
    expectContinue: boolean,
  ): Promise<void> => {
    const admission = options.validateRequest(request);
    if (!admission.allowed) {
      await writeResponseAndClose(response, admission.statusCode, { error: admission.reason });
      return;
    }
    if (route.matched) {
      await options.uploadServer.handleRequest(request, response, { expectContinue });
      return;
    }
    if (expectContinue) {
      response.writeContinue();
      removeExpectHeader(request);
    }
    await options.fallbackRequest(request, response);
  };

  const dispatchExpectation = async (
    request: IncomingMessage,
    response: ServerResponse,
    route: TRouteMatch,
  ): Promise<void> => {
    const admission = options.validateRequest(request);
    if (!admission.allowed) {
      await writeResponseAndClose(response, admission.statusCode, { error: admission.reason });
      return;
    }
    if (route.matched) {
      await options.uploadServer.handleRequest(request, response, { expectContinue: false });
      return;
    }
    await writeResponseAndClose(response, 417, null);
  };

  const dispatchUpgrade = async (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    route: TRouteMatch,
  ): Promise<void> => {
    const admission = options.validateRequest(request);
    if (!admission.allowed) {
      await writeRawGuardRejection(socket, admission.statusCode, admission.reason);
      return;
    }
    if (route.matched) {
      await options.uploadServer.handleUpgradeAttempt(request, socket);
      return;
    }
    await options.fallbackUpgrade(request, socket, head);
  };

  const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    const route = preflight(request, request.socket, 'server-http-request-failed');
    if (!route) return;
    contain(
      dispatchRequest(request, response, route, false),
      'server-http-request-failed',
      request.socket,
    );
  };

  const handleCheckContinue = (request: IncomingMessage, response: ServerResponse): void => {
    const route = preflight(request, request.socket, 'server-http-request-failed');
    if (!route) return;
    contain(
      dispatchRequest(request, response, route, true),
      'server-http-request-failed',
      request.socket,
    );
  };

  const handleCheckExpectation = (request: IncomingMessage, response: ServerResponse): void => {
    const route = preflight(request, request.socket, 'server-http-request-failed');
    if (!route) return;
    contain(
      dispatchExpectation(request, response, route),
      'server-http-request-failed',
      request.socket,
    );
  };

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (terminatingUpgrades) {
      safeDestroySocket(socket);
      return;
    }
    if (!upgradedSockets.has(socket)) {
      upgradedSockets.add(socket);
      socket.once('close', () => upgradedSockets.delete(socket));
    }
    const route = preflight(request, socket, 'server-http-upgrade-failed');
    if (!route) return;
    contain(
      dispatchUpgrade(request, socket, head, route),
      'server-http-upgrade-failed',
      socket,
    );
  };

  const terminateUpgradedSockets = (): void => {
    terminatingUpgrades = true;
    for (const socket of [...upgradedSockets]) safeDestroySocket(socket);
  };

  return {
    handleRequest,
    handleCheckContinue,
    handleCheckExpectation,
    handleUpgrade,
    terminateUpgradedSockets,
  };
};
