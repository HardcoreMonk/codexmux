import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import type {
  IUploadAdmissionService,
  IUploadReservationLease,
} from '@/lib/upload-admission';
import {
  classifyUploadRequestTarget,
  parseUploadRequestContract,
  type TParsedUploadRequest,
  type TUploadPolicy,
  type TUploadRouteMatch,
} from '@/lib/upload-request-contract';
import {
  validateUploadRequestOrigin,
  type IUploadRequestAuthorizationInput,
  type TUploadRequestAuthorization,
} from '@/lib/upload-request-auth';
import { validateSingleRequestHost } from '@/lib/request-authority';
import type {
  ICleanupResult,
  IStreamUploadArtifactInput,
  TUploadTransactionResult,
} from '@/lib/uploads-store';
import { createLogger } from '@/lib/logger';

export type TUploadErrorCode =
  | 'invalid-upload-target'
  | 'invalid-upload-request'
  | 'invalid-credential'
  | 'origin-forbidden'
  | 'method-not-allowed'
  | 'upload-timeout'
  | 'length-required'
  | 'payload-too-large'
  | 'unsupported-expectation'
  | 'upload-capacity-exhausted'
  | 'storage-failure'
  | 'auth-unavailable'
  | 'uploads-disabled'
  | 'upload-server-shutting-down';

export interface IUploadClock {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimeout: (timer: NodeJS.Timeout) => void;
}

export interface IUploadServerOptions {
  authorizeRequest: (
    input: IUploadRequestAuthorizationInput,
  ) => Promise<TUploadRequestAuthorization>;
  admission: IUploadAdmissionService;
  streamArtifact: (
    input: IStreamUploadArtifactInput,
  ) => Promise<TUploadTransactionResult>;
  createSessionRefreshHeader: (secure: boolean) => Promise<string>;
  cleanupStaleParts: () => Promise<ICleanupResult>;
  clock: IUploadClock;
  disabled: boolean;
}

export interface IUploadServer {
  classify: (request: Pick<IncomingMessage, 'url'>) => TUploadRouteMatch;
  start: () => Promise<void>;
  handleRequest: (
    request: IncomingMessage,
    response: ServerResponse,
    options: { expectContinue: boolean },
  ) => Promise<void>;
  handleUpgradeAttempt: (request: IncomingMessage, socket: Duplex) => Promise<void>;
  beginShutdown: () => void;
  shutdown: () => Promise<void>;
}

interface IResponseDescriptor {
  statusCode: number;
  code: TUploadErrorCode;
  error: string;
}

interface IActiveTransaction {
  abort: (reason: 'upload-server-shutting-down') => void;
  safePromise: Promise<void>;
}

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface ITrackedTransaction {
  ready: Promise<void>;
  abort: (reason: TUploadAbortReason) => void;
  isAborted: () => boolean;
  proceed: () => void;
  rejectProceed: (error: unknown) => void;
  result: Promise<TUploadTransactionResult>;
}

type TUploadAbortReason =
  | 'upload-aborted'
  | 'upload-timeout'
  | 'upload-server-shutting-down';

const IDLE_TIMEOUT_MS = 60_000;
const ABSOLUTE_TIMEOUT_MS = 270_000;
const MAINTENANCE_INTERVAL_MS = 30 * 60_000;

const log = createLogger('upload-server');

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  411: 'Length Required',
  413: 'Payload Too Large',
  417: 'Expectation Failed',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

const BASE_RESPONSES: Record<Exclude<TUploadErrorCode, 'payload-too-large' | 'storage-failure'>, IResponseDescriptor> = {
  'invalid-upload-target': {
    statusCode: 400,
    code: 'invalid-upload-target',
    error: 'Invalid upload target',
  },
  'invalid-upload-request': {
    statusCode: 400,
    code: 'invalid-upload-request',
    error: 'Invalid upload request',
  },
  'invalid-credential': {
    statusCode: 401,
    code: 'invalid-credential',
    error: 'Unauthorized',
  },
  'origin-forbidden': {
    statusCode: 403,
    code: 'origin-forbidden',
    error: 'Forbidden',
  },
  'method-not-allowed': {
    statusCode: 405,
    code: 'method-not-allowed',
    error: 'Method not allowed',
  },
  'upload-timeout': {
    statusCode: 408,
    code: 'upload-timeout',
    error: 'Upload timed out',
  },
  'length-required': {
    statusCode: 411,
    code: 'length-required',
    error: 'Content-Length required',
  },
  'unsupported-expectation': {
    statusCode: 417,
    code: 'unsupported-expectation',
    error: 'Unsupported Expect header',
  },
  'upload-capacity-exhausted': {
    statusCode: 429,
    code: 'upload-capacity-exhausted',
    error: 'Upload is busy. Try again.',
  },
  'auth-unavailable': {
    statusCode: 503,
    code: 'auth-unavailable',
    error: 'Upload unavailable',
  },
  'uploads-disabled': {
    statusCode: 503,
    code: 'uploads-disabled',
    error: 'Upload unavailable',
  },
  'upload-server-shutting-down': {
    statusCode: 503,
    code: 'upload-server-shutting-down',
    error: 'Upload unavailable',
  },
};

const deferred = <T>(): IDeferred<T> => {
  let resolve = (_value: T): void => undefined;
  let reject = (_error: unknown): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const policyResponse = (
  code: 'payload-too-large' | 'storage-failure',
  policy: TUploadPolicy,
): IResponseDescriptor => ({
  statusCode: code === 'payload-too-large' ? 413 : 500,
  code,
  error: code === 'payload-too-large'
    ? policy.kind === 'image' ? 'Image exceeds 10MB' : 'File exceeds 50MB'
    : policy.kind === 'image' ? 'Failed to save image' : 'Failed to save file',
});

const responseForCode = (
  code: TUploadErrorCode,
  policy?: TUploadPolicy,
): IResponseDescriptor => {
  if (code === 'payload-too-large' || code === 'storage-failure') {
    if (!policy) throw new Error(`policy required for ${code}`);
    return policyResponse(code, policy);
  }
  return BASE_RESPONSES[code];
};

const getRawHeaderValues = (request: Pick<IncomingMessage, 'rawHeaders'>, name: string): string[] => {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  return values;
};

const hasSupportedExpectation = (request: Pick<IncomingMessage, 'rawHeaders'>): boolean => {
  const values = getRawHeaderValues(request, 'expect');
  return values.length === 0
    || (values.length === 1 && values[0].trim().toLowerCase() === '100-continue');
};

const canWriteResponse = (response: ServerResponse): boolean => {
  const socket = response.socket;
  return !response.headersSent
    && !response.writableEnded
    && !response.destroyed
    && Boolean(socket)
    && !socket?.destroyed
    && socket?.writable !== false;
};

const createResponseCompletionWaiter = (response: ServerResponse): {
  promise: Promise<void>;
  cancel: () => void;
} => {
  let settle = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
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
  return { promise, cancel: settle };
};

const safeDestroySocket = (socket: Duplex | null): void => {
  if (!socket || socket.destroyed) return;
  try {
    socket.destroy();
  } catch {
    log.warn('upload-transport-close-failed');
  }
};

const closeResponseSocket = (response: ServerResponse): void => {
  const socket = response.socket;
  if (!socket || socket.destroyed || socket.writable === false) return;
  try {
    socket.end();
  } catch {
    safeDestroySocket(socket);
  }
};

const writeJsonAndClose = async (
  response: ServerResponse,
  statusCode: number,
  body: object,
  headers: Record<string, string> = {},
): Promise<void> => {
  if (!canWriteResponse(response)) return;
  const payload = Buffer.from(JSON.stringify(body));
  const completion = createResponseCompletionWaiter(response);
  try {
    response.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Length', payload.length);
    response.setHeader('Connection', 'close');
    response.end(payload);
  } catch {
    completion.cancel();
    safeDestroySocket(response.socket);
    return;
  }
  await completion.promise;
  closeResponseSocket(response);
};

const writeFailure = async (
  response: ServerResponse,
  descriptor: IResponseDescriptor,
  headers: Record<string, string> = {},
): Promise<void> => {
  await writeJsonAndClose(response, descriptor.statusCode, {
    code: descriptor.code,
    error: descriptor.error,
  }, headers);
};

const writeRawFailure = (
  socket: Duplex,
  descriptor: IResponseDescriptor,
): Promise<void> => {
  if (socket.destroyed) return Promise.resolve();
  if (socket.writable === false) {
    safeDestroySocket(socket);
    return Promise.resolve();
  }
  const payload = Buffer.from(JSON.stringify({
    code: descriptor.code,
    error: descriptor.error,
  }));
  const statusText = STATUS_TEXT[descriptor.statusCode] ?? 'Error';
  const head = [
    `HTTP/1.1 ${descriptor.statusCode} ${statusText}`,
    'Content-Type: application/json; charset=utf-8',
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

const transactionDescriptor = (
  result: Exclude<TUploadTransactionResult, { committed: true }>,
  policy: TUploadPolicy,
): IResponseDescriptor => {
  if (result.cleanup === 'failed') return policyResponse('storage-failure', policy);
  if (result.reason === 'upload-aborted' || result.reason === 'length-mismatch') {
    return BASE_RESPONSES['invalid-upload-request'];
  }
  if (result.reason === 'payload-too-large') return policyResponse('payload-too-large', policy);
  if (result.reason === 'storage-failure') return policyResponse('storage-failure', policy);
  return BASE_RESPONSES[result.reason];
};

const abortedResult = (reason: unknown): TUploadTransactionResult => {
  if (reason === 'upload-server-shutting-down') {
    return {
      committed: false,
      statusCode: 503,
      reason: 'upload-server-shutting-down',
      cleanup: 'not-required',
    };
  }
  if (reason === 'upload-timeout') {
    return {
      committed: false,
      statusCode: 408,
      reason: 'upload-timeout',
      cleanup: 'not-required',
    };
  }
  return {
    committed: false,
    statusCode: 400,
    reason: 'upload-aborted',
    cleanup: 'not-required',
  };
};

export const createUploadServer = (options: IUploadServerOptions): IUploadServer => {
  const activeTransactions = new Map<symbol, IActiveTransaction>();
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;
  let startPromise: Promise<void> | null = null;
  let maintenancePromise: Promise<void> | null = null;
  let maintenanceTimer: NodeJS.Timeout | null = null;
  let maintenanceGeneration = 0;

  const classify = (request: Pick<IncomingMessage, 'url'>): TUploadRouteMatch =>
    classifyUploadRequestTarget(request.url);

  const runMaintenance = (): Promise<void> => {
    if (maintenancePromise) return maintenancePromise;
    const completion = deferred<void>();
    const publishedPromise = completion.promise;
    maintenancePromise = publishedPromise;
    const task = (async () => {
      try {
        await options.cleanupStaleParts();
      } catch {
        log.warn('upload-maintenance-failed');
      }
    })();
    void task.then(
      () => {
        if (maintenancePromise === publishedPromise) maintenancePromise = null;
        completion.resolve();
      },
      (error) => {
        if (maintenancePromise === publishedPromise) maintenancePromise = null;
        completion.reject(error);
      },
    );
    return publishedPromise;
  };

  const scheduleMaintenance = (): void => {
    if (shuttingDown) return;
    const generation = ++maintenanceGeneration;
    const timer = options.clock.setTimeout(() => {
      if (
        shuttingDown
        || generation !== maintenanceGeneration
        || maintenanceTimer !== timer
      ) {
        return;
      }
      maintenanceTimer = null;
      const task = runMaintenance();
      void task.then(() => {
        if (shuttingDown || generation !== maintenanceGeneration) return;
        try {
          scheduleMaintenance();
        } catch {
          log.warn('upload-maintenance-schedule-failed');
        }
      });
    }, MAINTENANCE_INTERVAL_MS);
    maintenanceTimer = timer;
    try {
      timer.unref?.();
    } catch (error) {
      maintenanceTimer = null;
      try {
        options.clock.clearTimeout(timer);
      } catch {
        // The scheduling error remains the programming error reported by start().
      }
      throw error;
    }
  };

  const start = (): Promise<void> => {
    if (startPromise) return startPromise;
    if (shuttingDown) return Promise.resolve();
    const completion = deferred<void>();
    startPromise = completion.promise;
    const task = (async () => {
      await runMaintenance();
      if (!shuttingDown) scheduleMaintenance();
    })();
    void task.then(completion.resolve, completion.reject);
    return completion.promise;
  };

  const beginShutdown = (): void => {
    shuttingDown = true;
  };

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    beginShutdown();
    maintenanceGeneration += 1;
    const timer = maintenanceTimer;
    maintenanceTimer = null;
    const task = Promise.resolve().then(async () => {
      let shutdownError: unknown;
      let hasShutdownError = false;
      const recordError = (error: unknown): void => {
        if (hasShutdownError) return;
        hasShutdownError = true;
        shutdownError = error;
      };
      if (timer) {
        try {
          options.clock.clearTimeout(timer);
        } catch (error) {
          recordError(error);
        }
      }
      try {
        options.admission.shutdown();
      } catch (error) {
        recordError(error);
      }
      for (const active of activeTransactions.values()) {
        active.abort('upload-server-shutting-down');
      }
      const activeWork = [...activeTransactions.values()].map((active) => active.safePromise);
      const cleanup = maintenancePromise;
      await Promise.all([
        ...activeWork,
        ...(cleanup ? [cleanup] : []),
      ]);
      if (hasShutdownError) throw shutdownError;
    });
    shutdownPromise = task;
    return task;
  };

  const createTrackedTransaction = (
    request: IncomingMessage,
    response: ServerResponse,
    lease: IUploadReservationLease,
    policy: TUploadPolicy,
    parsed: TParsedUploadRequest,
    admittedAt: number,
  ): ITrackedTransaction => {
    const id = Symbol('active-upload');
    const controller = new AbortController();
    const ready = deferred<void>();
    const proceed = deferred<void>();
    let idleTimer: NodeJS.Timeout | null = null;
    let absoluteTimer: NodeJS.Timeout | null = null;
    let idleGeneration = 0;
    let finished = false;
    let readySettled = false;

    const abort = (reason: TUploadAbortReason): void => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    const leaseAbort = (): void => {
      abort(lease.signal.reason === 'upload-server-shutting-down'
        ? 'upload-server-shutting-down'
        : 'upload-aborted');
    };
    const requestAbort = (): void => abort('upload-aborted');
    const requestClose = (): void => {
      if (!request.complete) abort('upload-aborted');
    };
    const responseClose = (): void => {
      if (!finished) abort('upload-aborted');
    };

    const clearTimers = (): void => {
      idleGeneration += 1;
      const timers = [idleTimer, absoluteTimer];
      idleTimer = null;
      absoluteTimer = null;
      let clearError: unknown;
      for (const timer of timers) {
        if (!timer) continue;
        try {
          options.clock.clearTimeout(timer);
        } catch (error) {
          clearError ??= error;
        }
      }
      if (clearError) throw clearError;
    };

    const resetIdleTimer = (delayMs: number = IDLE_TIMEOUT_MS): void => {
      if (finished || controller.signal.aborted) return;
      if (idleTimer) options.clock.clearTimeout(idleTimer);
      const generation = ++idleGeneration;
      const timer = options.clock.setTimeout(() => {
        if (
          finished
          || generation !== idleGeneration
          || idleTimer !== timer
        ) {
          return;
        }
        abort('upload-timeout');
      }, delayMs);
      idleTimer = timer;
    };

    const execute = async (): Promise<TUploadTransactionResult> => {
      try {
        request.once('aborted', requestAbort);
        request.once('error', requestAbort);
        request.once('close', requestClose);
        response.once('close', responseClose);
        response.once('error', responseClose);
        lease.signal.addEventListener('abort', leaseAbort, { once: true });
        if (lease.signal.aborted) leaseAbort();
        if (
          request.aborted
          || request.destroyed
          || response.destroyed
          || response.writableEnded
          || !response.socket
          || response.socket.destroyed
          || response.socket.writable === false
        ) {
          abort('upload-aborted');
        }
        if (!controller.signal.aborted) {
          const currentTime = options.clock.now();
          if (!Number.isFinite(currentTime)) throw new Error('invalid upload clock');
          const elapsedMs = Math.max(0, currentTime - admittedAt);
          if (elapsedMs >= IDLE_TIMEOUT_MS || elapsedMs >= ABSOLUTE_TIMEOUT_MS) {
            abort('upload-timeout');
          } else {
            resetIdleTimer(IDLE_TIMEOUT_MS - elapsedMs);
            const timer = options.clock.setTimeout(() => {
              if (finished || absoluteTimer !== timer) return;
              abort('upload-timeout');
            }, ABSOLUTE_TIMEOUT_MS - elapsedMs);
            absoluteTimer = timer;
          }
        }
        readySettled = true;
        ready.resolve();
        await proceed.promise;
        if (controller.signal.aborted) return abortedResult(controller.signal.reason);
        return await options.streamArtifact({
          source: request,
          policy,
          declaredBytes: parsed.declaredBytes,
          mime: parsed.mime,
          ...(parsed.originalName !== undefined ? { originalName: parsed.originalName } : {}),
          ...(parsed.workspaceId !== undefined ? { workspaceId: parsed.workspaceId } : {}),
          ...(parsed.tabId !== undefined ? { tabId: parsed.tabId } : {}),
          signal: controller.signal,
          onProgress: resetIdleTimer,
        });
      } catch (error) {
        if (!readySettled) ready.reject(error);
        log.error('upload-transaction-programming-error');
        throw error;
      } finally {
        finished = true;
        let finalizationError: unknown;
        const finalize = (operation: () => void): void => {
          try {
            operation();
          } catch (error) {
            finalizationError ??= error;
          }
        };
        finalize(clearTimers);
        finalize(() => request.off('aborted', requestAbort));
        finalize(() => request.off('error', requestAbort));
        finalize(() => request.off('close', requestClose));
        finalize(() => response.off('close', responseClose));
        finalize(() => response.off('error', responseClose));
        finalize(() => lease.signal.removeEventListener('abort', leaseAbort));
        finalize(lease.release);
        if (finalizationError) throw finalizationError;
      }
    };

    const execution = Promise.resolve().then(execute);
    const safePromise = execution.then(() => undefined, () => undefined);
    activeTransactions.set(id, { abort, safePromise });
    void safePromise.then(() => {
      activeTransactions.delete(id);
    });

    return {
      ready: ready.promise,
      abort,
      isAborted: () => controller.signal.aborted,
      proceed: () => proceed.resolve(),
      rejectProceed: proceed.reject,
      result: execution,
    };
  };

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
    requestOptions: { expectContinue: boolean },
  ): Promise<void> => {
    const route = classify(request);
    if (!route.matched) return;
    if (!route.valid) {
      await writeFailure(response, BASE_RESPONSES['invalid-upload-target']);
      return;
    }
    const policy = route.policy;
    if (options.disabled) {
      await writeFailure(response, BASE_RESPONSES['uploads-disabled']);
      return;
    }
    if (shuttingDown) {
      await writeFailure(response, BASE_RESPONSES['upload-server-shutting-down']);
      return;
    }
    const isTransportClosed = (): boolean => Boolean(
      request.aborted
      || request.destroyed
      || response.headersSent
      || response.destroyed
      || response.writableEnded
      || !response.socket
      || response.socket.destroyed
      || response.socket.writable === false
    );
    let transportClosed = isTransportClosed();
    const closeGate = (): void => {
      transportClosed = true;
    };
    const requestGateClose = (): void => {
      if (!request.complete) closeGate();
    };
    request.once('aborted', closeGate);
    request.once('error', closeGate);
    request.once('close', requestGateClose);
    response.once('close', closeGate);
    response.once('error', closeGate);
    if (isTransportClosed()) transportClosed = true;
    const removeGateListeners = (): void => {
      request.off('aborted', closeGate);
      request.off('error', closeGate);
      request.off('close', requestGateClose);
      response.off('close', closeGate);
      response.off('error', closeGate);
    };

    try {
      if (transportClosed) return;
      const host = validateSingleRequestHost(request);
      if (!host.valid) {
        await writeFailure(response, BASE_RESPONSES['invalid-upload-request']);
        return;
      }

      let authorization: TUploadRequestAuthorization;
      try {
        authorization = await options.authorizeRequest({
          headers: request.headers,
          rawHeaders: request.rawHeaders,
        });
      } catch {
        log.warn('auth-unavailable');
        if (!transportClosed) {
          await writeFailure(response, BASE_RESPONSES['auth-unavailable']);
        }
        return;
      }
      if (transportClosed) return;
      if (shuttingDown) {
        await writeFailure(response, BASE_RESPONSES['upload-server-shutting-down']);
        return;
      }
      if (!authorization.authorized) {
        await writeFailure(response, responseForCode(authorization.reason));
        return;
      }
      const origin = validateUploadRequestOrigin({
        headers: request.headers,
        rawHeaders: request.rawHeaders,
      }, authorization.credential);
      if (!origin.valid) {
        await writeFailure(response, BASE_RESPONSES['origin-forbidden']);
        return;
      }
      if (request.method !== 'POST') {
        await writeFailure(response, BASE_RESPONSES['method-not-allowed'], { Allow: 'POST' });
        return;
      }
      if (!hasSupportedExpectation(request)) {
        await writeFailure(response, BASE_RESPONSES['unsupported-expectation']);
        return;
      }
      const contract = parseUploadRequestContract(request, policy);
      if (!contract.valid) {
        await writeFailure(
          response,
          responseForCode(contract.reason, policy),
        );
        return;
      }

      if (authorization.credential.kind === 'session' && authorization.refreshSession) {
        try {
          const refresh = await options.createSessionRefreshHeader(origin.secure);
          if (transportClosed) return;
          response.setHeader('Set-Cookie', refresh);
        } catch {
          log.warn('auth-unavailable');
          if (!transportClosed) {
            await writeFailure(response, BASE_RESPONSES['auth-unavailable']);
          }
          return;
        }
      }
      if (transportClosed) return;
      if (shuttingDown) {
        await writeFailure(response, BASE_RESPONSES['upload-server-shutting-down']);
        return;
      }

      const admission = options.admission.reserve(contract.value.declaredBytes);
      if (!admission.admitted) {
        const headers: Record<string, string> = admission.reason === 'upload-capacity-exhausted'
          ? { 'Retry-After': '1' }
          : {};
        await writeFailure(response, BASE_RESPONSES[admission.reason], headers);
        return;
      }
      const { lease } = admission;
      let admittedAt: number;
      try {
        admittedAt = options.clock.now();
        if (!Number.isFinite(admittedAt)) throw new Error('invalid upload clock');
      } catch (error) {
        lease.release();
        throw error;
      }
      if (transportClosed || shuttingDown || lease.signal.aborted) {
        lease.release();
        if (!transportClosed) {
          await writeFailure(response, BASE_RESPONSES['upload-server-shutting-down']);
        }
        return;
      }

      const transaction = createTrackedTransaction(
        request,
        response,
        lease,
        policy,
        contract.value,
        admittedAt,
      );
      await transaction.ready;
      if (transportClosed) transaction.abort('upload-aborted');
      removeGateListeners();
      if (requestOptions.expectContinue && !transaction.isAborted()) {
        try {
          response.writeContinue();
        } catch (error) {
          transaction.rejectProceed(error);
          try {
            await transaction.result;
          } catch {
            // The original writeContinue failure owns this transport boundary.
          }
          safeDestroySocket(response.socket);
          throw error;
        }
      }
      transaction.proceed();
      const result = await transaction.result;
      if (result.committed) {
        await writeJsonAndClose(response, 200, result.receipt);
        return;
      }
      const descriptor = transactionDescriptor(result, policy);
      log.warn(descriptor.code);
      await writeFailure(response, descriptor);
    } finally {
      removeGateListeners();
    }
  };

  const handleUpgradeAttempt = async (
    request: IncomingMessage,
    socket: Duplex,
  ): Promise<void> => {
    const route = classify(request);
    if (!route.matched) return;
    if (shuttingDown) {
      await writeRawFailure(socket, BASE_RESPONSES['upload-server-shutting-down']);
      return;
    }
    if (options.disabled) {
      await writeRawFailure(socket, BASE_RESPONSES['uploads-disabled']);
      return;
    }
    if (!route.valid) {
      await writeRawFailure(socket, BASE_RESPONSES['invalid-upload-target']);
      return;
    }
    await writeRawFailure(socket, BASE_RESPONSES['invalid-upload-request']);
  };

  return {
    classify,
    start,
    handleRequest,
    handleUpgradeAttempt,
    beginShutdown,
    shutdown,
  };
};
