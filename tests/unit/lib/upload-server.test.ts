import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { PassThrough, type Duplex } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IUploadAdmissionService,
  IUploadReservationLease,
  TUploadAdmissionResult,
} from '@/lib/upload-admission';
import type {
  TUploadRequestAuthorization,
} from '@/lib/upload-request-auth';
import type {
  IStreamUploadArtifactInput,
  TUploadTransactionResult,
} from '@/lib/uploads-store';

const logMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: logMocks.error,
    warn: logMocks.warn,
  }),
}));

import {
  createUploadServer,
  type IUploadClock,
  type IUploadServer,
  type IUploadServerOptions,
} from '@/lib/upload-server';

const IDLE_TIMEOUT_MS = 60_000;
const ABSOLUTE_TIMEOUT_MS = 270_000;
const MAINTENANCE_INTERVAL_MS = 30 * 60_000;

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

const requireValue = <T>(value: T | null): T => {
  if (value === null) throw new Error('expected captured value');
  return value;
};

interface IFakeTimer {
  callback: () => void;
  delayMs: number;
  cleared: boolean;
  unref: ReturnType<typeof vi.fn>;
}

class FakeClock implements IUploadClock {
  nowValue = 0;
  timers: IFakeTimer[] = [];
  throwOnNow: Error | null = null;
  throwOnSet: Error | null = null;
  throwOnUnref: Error | null = null;
  throwOnClear: Error | null = null;
  throwOnClearDelayMs: number | null = null;

  now = (): number => {
    if (this.throwOnNow) throw this.throwOnNow;
    return this.nowValue;
  };

  setTimeout = (callback: () => void, delayMs: number): NodeJS.Timeout => {
    if (this.throwOnSet) throw this.throwOnSet;
    const timer: IFakeTimer = {
      callback,
      delayMs,
      cleared: false,
      unref: vi.fn(() => {
        if (this.throwOnUnref) throw this.throwOnUnref;
      }),
    };
    this.timers.push(timer);
    return timer as unknown as NodeJS.Timeout;
  };

  clearTimeout = (rawTimer: NodeJS.Timeout): void => {
    const timer = rawTimer as unknown as IFakeTimer;
    timer.cleared = true;
    if (
      this.throwOnClear
      && (this.throwOnClearDelayMs === null || timer.delayMs === this.throwOnClearDelayMs)
    ) {
      throw this.throwOnClear;
    }
  };

  latest = (delayMs: number): IFakeTimer => {
    const timer = [...this.timers].reverse().find((candidate) => candidate.delayMs === delayMs);
    if (!timer) throw new Error(`missing timer ${delayMs}`);
    return timer;
  };

  fire = (timer: IFakeTimer): void => {
    timer.callback();
  };
}

class FakeSocket extends EventEmitter {
  destroyed = false;
  writable = true;
  ended = false;
  chunks: Buffer[] = [];

  write = vi.fn((chunk: string | Buffer, callback?: () => void): boolean => {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback?.();
    return true;
  });

  end = vi.fn((chunk?: string | Buffer, callback?: () => void): this => {
    if (chunk !== undefined) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.ended = true;
    this.writable = false;
    callback?.();
    return this;
  });

  destroy = vi.fn((): this => {
    this.destroyed = true;
    this.writable = false;
    this.emit('close');
    return this;
  });

  text = (): string => Buffer.concat(this.chunks).toString('utf8');
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  readonly socket = new FakeSocket();
  readonly headers = new Map<string, number | string | string[]>();
  readonly bodyChunks: Buffer[] = [];
  readonly autoFinish: boolean;

  constructor(autoFinish: boolean = true) {
    super();
    this.autoFinish = autoFinish;
  }

  setHeader = vi.fn((name: string, value: number | string | readonly string[]): this => {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? [...value] : value as string | number);
    return this;
  });

  getHeader = (name: string): number | string | string[] | undefined =>
    this.headers.get(name.toLowerCase());

  writeContinue = vi.fn((): void => undefined);

  end = vi.fn((chunk?: string | Buffer): this => {
    if (chunk !== undefined) {
      this.bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.headersSent = true;
    this.writableEnded = true;
    if (this.autoFinish) queueMicrotask(() => this.emit('finish'));
    return this;
  });

  json = (): unknown => JSON.parse(Buffer.concat(this.bodyChunks).toString('utf8')) as unknown;
}

type TRequest = PassThrough & IncomingMessage;

const headersFromRaw = (rawHeaders: string[]): IncomingMessage['headers'] => {
  const headers: IncomingMessage['headers'] = {};
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index].toLowerCase();
    const value = rawHeaders[index + 1] ?? '';
    const existing = headers[name];
    if (existing === undefined) headers[name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else headers[name] = [String(existing), value];
  }
  return headers;
};

const createRequest = (options: {
  url?: string;
  method?: string;
  rawHeaders?: string[];
  complete?: boolean;
} = {}): TRequest => {
  const rawHeaders = options.rawHeaders ?? [
    'Host', 'localhost:3000',
    'Content-Length', '1',
  ];
  const request = new PassThrough() as TRequest;
  Object.assign(request, {
    url: options.url ?? '/api/upload-file',
    method: options.method ?? 'POST',
    rawHeaders,
    headers: headersFromRaw(rawHeaders),
    complete: options.complete ?? false,
  });
  return request;
};

const createResponse = (autoFinish: boolean = true): FakeResponse =>
  new FakeResponse(autoFinish);

const asResponse = (response: FakeResponse): ServerResponse =>
  response as unknown as ServerResponse;

const asSocket = (socket: FakeSocket): Duplex => socket as unknown as Duplex;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

const committedResult = (): TUploadTransactionResult => ({
  committed: true,
  receipt: { path: '/safe/artifact.txt', filename: 'artifact.txt' },
});

const failureResult = (
  reason: Exclude<TUploadTransactionResult, { committed: true }>['reason'],
  cleanup: 'complete' | 'failed' | 'not-required' = 'complete',
): TUploadTransactionResult => {
  const statusCode = reason === 'upload-timeout'
    ? 408
    : reason === 'payload-too-large'
      ? 413
      : reason === 'storage-failure'
        ? 500
        : reason === 'upload-server-shutting-down'
          ? 503
          : 400;
  return { committed: false, statusCode, reason, cleanup };
};

interface IHarness {
  server: IUploadServer;
  clock: FakeClock;
  authorizeRequest: ReturnType<typeof vi.fn>;
  reserve: ReturnType<typeof vi.fn>;
  admissionShutdown: ReturnType<typeof vi.fn>;
  streamArtifact: ReturnType<typeof vi.fn>;
  createSessionRefreshHeader: ReturnType<typeof vi.fn>;
  cleanupStaleParts: ReturnType<typeof vi.fn>;
  lease: IUploadReservationLease;
  leaseController: AbortController;
  release: ReturnType<typeof vi.fn>;
}

const createHarness = (overrides: Partial<IUploadServerOptions> = {}): IHarness => {
  const clock = overrides.clock instanceof FakeClock ? overrides.clock : new FakeClock();
  const leaseController = new AbortController();
  const release = vi.fn();
  const lease: IUploadReservationLease = {
    ownerId: Symbol('test-upload'),
    signal: leaseController.signal,
    release,
  };
  const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => ({
    authorized: true,
    credential: { kind: 'cli' },
    refreshSession: false,
  }));
  const reserve = vi.fn((): TUploadAdmissionResult => ({ admitted: true, lease }));
  const admissionShutdown = vi.fn(() => {
    leaseController.abort('upload-server-shutting-down');
  });
  const admission: IUploadAdmissionService = {
    reserve,
    shutdown: admissionShutdown,
  };
  const streamArtifact = vi.fn(async (): Promise<TUploadTransactionResult> => committedResult());
  const createSessionRefreshHeader = vi.fn(async () => 'cmux-session=refreshed');
  const cleanupStaleParts = vi.fn(async () => ({ deleted: 0, freedBytes: 0 }));
  const options: IUploadServerOptions = {
    authorizeRequest,
    admission,
    streamArtifact,
    createSessionRefreshHeader,
    cleanupStaleParts,
    clock,
    disabled: false,
    ...overrides,
  };
  const server = createUploadServer(options);
  return {
    server,
    clock,
    authorizeRequest: options.authorizeRequest as ReturnType<typeof vi.fn>,
    reserve: options.admission.reserve as ReturnType<typeof vi.fn>,
    admissionShutdown: options.admission.shutdown as ReturnType<typeof vi.fn>,
    streamArtifact: options.streamArtifact as ReturnType<typeof vi.fn>,
    createSessionRefreshHeader: options.createSessionRefreshHeader as ReturnType<typeof vi.fn>,
    cleanupStaleParts: options.cleanupStaleParts as ReturnType<typeof vi.fn>,
    lease,
    leaseController,
    release,
  };
};

const expectNoBodyWork = (harness: IHarness, request: TRequest): void => {
  expect(harness.reserve).not.toHaveBeenCalled();
  expect(harness.streamArtifact).not.toHaveBeenCalled();
  expect(request.listenerCount('data')).toBe(0);
};

const expectJsonResponse = (
  response: FakeResponse,
  statusCode: number,
  value: unknown,
): void => {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toEqual(value);
  expect(response.getHeader('connection')).toBe('close');
  expect(response.getHeader('content-type')).toBe('application/json; charset=utf-8');
  const body = Buffer.concat(response.bodyChunks);
  expect(response.getHeader('content-length')).toBe(body.length);
};

beforeEach(() => {
  logMocks.error.mockReset();
  logMocks.warn.mockReset();
});

describe('upload server request ownership and gates', () => {
  it('keeps classification pure for exact, normalization-only, and unmatched targets', () => {
    const harness = createHarness();

    expect(harness.server.classify({ url: '/api/upload-file?x=1' })).toMatchObject({
      matched: true,
      valid: true,
    });
    expect(harness.server.classify({ url: '/api/./upload-file' })).toEqual({
      matched: true,
      valid: false,
      statusCode: 400,
      reason: 'invalid-upload-target',
    });
    expect(harness.server.classify({ url: '/api/health' })).toEqual({ matched: false });
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
  });

  it('does nothing for an unmatched request', async () => {
    const harness = createHarness();
    const request = createRequest({ url: '/api/health' });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expect(response.end).not.toHaveBeenCalled();
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
  });

  it('owns normalization-only targets and rejects them without authentication', async () => {
    const harness = createHarness();
    const request = createRequest({ url: '/api/./upload-file' });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 400, { code: 'invalid-upload-target', error: 'Invalid upload target' });
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
  });

  it.each([
    ['disabled', true, false, 'uploads-disabled'],
    ['shutting down', false, true, 'upload-server-shutting-down'],
  ] as const)('returns an early 503 while %s', async (_, disabled, shutdown, code) => {
    const harness = createHarness({ disabled });
    if (shutdown) harness.server.beginShutdown();
    const request = createRequest();
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 503, { code, error: 'Upload unavailable' });
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
  });

  it('rejects an invalid Host before inspecting an unsupported Expect value', async () => {
    const harness = createHarness();
    const request = createRequest({
      rawHeaders: ['Content-Length', '1', 'Expect', 'something-else'],
    });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 400, {
      code: 'invalid-upload-request',
      error: 'Invalid upload request',
    });
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
  });

  it('returns credential rejection before inspecting an unsupported Expect value', async () => {
    const order: string[] = [];
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => {
      order.push('authorize');
      return {
        authorized: false,
        statusCode: 401,
        reason: 'invalid-credential',
      };
    });
    const harness = createHarness({ authorizeRequest });
    const request = createRequest({ rawHeaders: [
      'Host', 'localhost:3000',
      'Content-Length', '1',
      'Expect', 'something-else',
    ] });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expect(order).toEqual(['authorize']);
    expectJsonResponse(response, 401, { code: 'invalid-credential', error: 'Unauthorized' });
    expectNoBodyWork(harness, request);
  });

  it.each([
    [['Expect', 'something-else']],
    [['Expect', '100-continue', 'Expect', 'something-else']],
  ])('rejects unsupported or duplicate Expect after valid authentication', async (expectHeaders) => {
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => ({
      authorized: true,
      credential: { kind: 'session', expiresAtEpochSeconds: 999 },
      refreshSession: false,
    }));
    const harness = createHarness({ authorizeRequest });
    const request = createRequest({
      rawHeaders: [
        'Host', 'localhost:3000',
        'Origin', 'http://localhost:3000',
        'Content-Length', '1',
        ...expectHeaders,
      ],
    });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expect(authorizeRequest).toHaveBeenCalledTimes(1);
    expectJsonResponse(response, 417, {
      code: 'unsupported-expectation',
      error: 'Unsupported Expect header',
    });
    expectNoBodyWork(harness, request);
  });

  it('rejects a session authority mismatch before inspecting an unsupported Expect value', async () => {
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => ({
      authorized: true,
      credential: { kind: 'session', expiresAtEpochSeconds: 999 },
      refreshSession: false,
    }));
    const harness = createHarness({ authorizeRequest });
    const request = createRequest({ rawHeaders: [
      'Host', 'localhost:3000',
      'Origin', 'https://attacker.example',
      'Content-Length', '1',
      'Expect', 'something-else',
    ] });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 403, { code: 'origin-forbidden', error: 'Forbidden' });
    expectNoBodyWork(harness, request);
  });

  it.each([
    ['missing', ['Content-Length', '1']],
    ['duplicate', ['Host', 'localhost:3000', 'Host', 'localhost:3000', 'Content-Length', '1']],
    ['malformed', ['Host', 'localhost:99999', 'Content-Length', '1']],
  ])('rejects a %s Host before authorization', async (_, rawHeaders) => {
    const harness = createHarness();
    const request = createRequest({ rawHeaders });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 400, {
      code: 'invalid-upload-request',
      error: 'Invalid upload request',
    });
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
  });

  it.each([
    [400, 'invalid-upload-request', 'Invalid upload request'],
    [401, 'invalid-credential', 'Unauthorized'],
    [503, 'auth-unavailable', 'Upload unavailable'],
  ] as const)('maps authorization rejection %s', async (statusCode, reason, error) => {
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => ({
      authorized: false,
      statusCode,
      reason,
    }));
    const harness = createHarness({ authorizeRequest });
    const request = createRequest();
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, statusCode, { code: reason, error });
    expectNoBodyWork(harness, request);
  });

  it('maps a rejected authorization dependency to auth-unavailable', async () => {
    const authorizeRequest = vi.fn(async () => {
      throw new Error('/private/token/path');
    });
    const harness = createHarness({ authorizeRequest });
    const request = createRequest();
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 503, { code: 'auth-unavailable', error: 'Upload unavailable' });
    expectNoBodyWork(harness, request);
    expect(logMocks.warn).toHaveBeenCalledWith('auth-unavailable');
  });

  it('validates credential-specific Origin before method and policy', async () => {
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => ({
      authorized: true,
      credential: { kind: 'session', expiresAtEpochSeconds: 999 },
      refreshSession: false,
    }));
    const harness = createHarness({ authorizeRequest });
    const request = createRequest();
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 403, { code: 'origin-forbidden', error: 'Forbidden' });
    expectNoBodyWork(harness, request);
  });

  it('returns Allow: POST before inspecting Expect for an authenticated non-POST request', async () => {
    const harness = createHarness();
    const request = createRequest({
      method: 'GET',
      rawHeaders: ['Host', 'localhost:3000', 'Expect', 'something-else'],
    });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 405, { code: 'method-not-allowed', error: 'Method not allowed' });
    expect(response.getHeader('allow')).toBe('POST');
    expectNoBodyWork(harness, request);
  });

  it.each([
    [['Host', 'localhost:3000'], 411, 'length-required', 'Content-Length required'],
    [[
      'Host', 'localhost:3000',
      'Content-Length', String(50 * 1024 * 1024 + 1),
    ], 413, 'payload-too-large', 'File exceeds 50MB'],
    [[
      'Host', 'localhost:3000',
      'Content-Length', '01',
    ], 400, 'invalid-upload-request', 'Invalid upload request'],
  ] as const)('maps request contract rejection', async (rawHeaders, statusCode, code, error) => {
    const harness = createHarness();
    const request = createRequest({ rawHeaders: [...rawHeaders] });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, statusCode, { code, error });
    expectNoBodyWork(harness, request);
  });

  it('signs a secure rolling refresh before admission and preserves it on 429', async () => {
    const order: string[] = [];
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => {
      order.push('authorize');
      return {
        authorized: true,
        credential: { kind: 'session', expiresAtEpochSeconds: 999 },
        refreshSession: true,
      };
    });
    const createSessionRefreshHeader = vi.fn(async (secure: boolean) => {
      order.push(`refresh:${secure}`);
      return 'cmux-session=renewed; Secure';
    });
    const reserve = vi.fn((): TUploadAdmissionResult => {
      order.push('reserve');
      return {
        admitted: false,
        statusCode: 429,
        reason: 'upload-capacity-exhausted',
      };
    });
    const admission = { reserve, shutdown: vi.fn() };
    const harness = createHarness({ authorizeRequest, createSessionRefreshHeader, admission });
    const request = createRequest({
      rawHeaders: [
        'Host', 'example.test',
        'Origin', 'https://example.test',
        'Content-Length', '1',
      ],
    });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expect(order).toEqual(['authorize', 'refresh:true', 'reserve']);
    expect(response.getHeader('set-cookie')).toBe('cmux-session=renewed; Secure');
    expect(response.getHeader('retry-after')).toBe('1');
    expectJsonResponse(response, 429, {
      code: 'upload-capacity-exhausted',
      error: 'Upload is busy. Try again.',
    });
    expect(harness.streamArtifact).not.toHaveBeenCalled();
  });

  it('maps refresh signing failure before admission', async () => {
    const authorizeRequest = vi.fn(async (): Promise<TUploadRequestAuthorization> => ({
      authorized: true,
      credential: { kind: 'session', expiresAtEpochSeconds: 999 },
      refreshSession: true,
    }));
    const createSessionRefreshHeader = vi.fn(async () => {
      throw new Error('secret path');
    });
    const harness = createHarness({ authorizeRequest, createSessionRefreshHeader });
    const request = createRequest({
      rawHeaders: [
        'Host', 'localhost:3000',
        'Origin', 'http://localhost:3000',
        'Content-Length', '1',
      ],
    });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 503, { code: 'auth-unavailable', error: 'Upload unavailable' });
    expectNoBodyWork(harness, request);
  });

  it('reserves before writing a single 100 Continue and starting storage', async () => {
    const order: string[] = [];
    const reserve = vi.fn((): TUploadAdmissionResult => {
      order.push('reserve');
      const controller = new AbortController();
      return {
        admitted: true,
        lease: { ownerId: Symbol(), signal: controller.signal, release: vi.fn() },
      };
    });
    const streamArtifact = vi.fn(async (): Promise<TUploadTransactionResult> => {
      order.push('stream');
      return committedResult();
    });
    const harness = createHarness({ admission: { reserve, shutdown: vi.fn() }, streamArtifact });
    const request = createRequest({
      rawHeaders: [
        'Host', 'localhost:3000',
        'Content-Length', '1',
        'Expect', '100-continue',
      ],
    });
    const response = createResponse();
    response.writeContinue.mockImplementation(() => {
      order.push('continue');
    });

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: true });

    expect(order).toEqual(['reserve', 'continue', 'stream']);
    expect(response.writeContinue).toHaveBeenCalledTimes(1);
    expectJsonResponse(response, 200, { path: '/safe/artifact.txt', filename: 'artifact.txt' });
    expect(response.getHeader('connection')).toBe('close');
  });

  it('does not reserve when the client disconnects during an async gate', async () => {
    const auth = deferred<TUploadRequestAuthorization>();
    const authorizeRequest = vi.fn(() => auth.promise);
    const harness = createHarness({ authorizeRequest });
    const request = createRequest();
    const response = createResponse();

    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    request.emit('aborted');
    auth.resolve({ authorized: true, credential: { kind: 'cli' }, refreshSession: false });
    await handling;

    expect(response.end).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
  });

  it('does not miss a queued disconnect while handing off to an admitted transaction', async () => {
    const auth = deferred<TUploadRequestAuthorization>();
    const authorizeRequest = vi.fn(() => auth.promise);
    const harness = createHarness({ authorizeRequest });
    const request = createRequest();
    const response = createResponse(false);
    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );

    auth.resolve({ authorized: true, credential: { kind: 'cli' }, refreshSession: false });
    queueMicrotask(() => {
      response.destroyed = true;
      response.socket.destroyed = true;
      response.emit('close');
    });
    await handling;

    expect(harness.reserve).toHaveBeenCalledTimes(1);
    expect(harness.streamArtifact).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(response.writeContinue).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  it('rejects an already closed transport before asynchronous authorization', async () => {
    const harness = createHarness();
    const request = createRequest();
    const response = createResponse(false);
    response.destroyed = true;
    response.socket.destroyed = true;

    await harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );

    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expectNoBodyWork(harness, request);
    expect(response.end).not.toHaveBeenCalled();
  });

  it('does not send 100 Continue when lease shutdown wins before handler continuation', async () => {
    const leaseController = new AbortController();
    const release = vi.fn();
    const reserve = vi.fn((): TUploadAdmissionResult => {
      queueMicrotask(() => leaseController.abort('upload-server-shutting-down'));
      return {
        admitted: true,
        lease: {
          ownerId: Symbol('shutdown-race'),
          signal: leaseController.signal,
          release,
        },
      };
    });
    const harness = createHarness({ admission: { reserve, shutdown: vi.fn() } });
    const response = createResponse();

    await harness.server.handleRequest(
      createRequest({ rawHeaders: [
        'Host', 'localhost:3000',
        'Content-Length', '1',
        'Expect', '100-continue',
      ] }),
      asResponse(response),
      { expectContinue: true },
    );

    expect(response.writeContinue).not.toHaveBeenCalled();
    expect(harness.streamArtifact).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expectJsonResponse(response, 503, {
      code: 'upload-server-shutting-down',
      error: 'Upload unavailable',
    });
  });

  it('anchors initial idle and absolute timer delays to the admission timestamp', async () => {
    const clock = new FakeClock();
    const storage = deferred<TUploadTransactionResult>();
    const controller = new AbortController();
    const release = vi.fn();
    const reserve = vi.fn((): TUploadAdmissionResult => {
      queueMicrotask(() => {
        clock.nowValue = 15_000;
      });
      return {
        admitted: true,
        lease: { ownerId: Symbol('timed'), signal: controller.signal, release },
      };
    });
    const streamArtifact = vi.fn(() => storage.promise);
    const harness = createHarness({
      clock,
      admission: { reserve, shutdown: vi.fn() },
      streamArtifact,
    });
    const response = createResponse();
    const handling = harness.server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));

    expect(clock.latest(IDLE_TIMEOUT_MS - 15_000).delayMs).toBe(45_000);
    expect(clock.latest(ABSOLUTE_TIMEOUT_MS - 15_000).delayMs).toBe(255_000);

    storage.resolve(committedResult());
    await handling;
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not continue or start storage when the admission idle budget already elapsed', async () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    const release = vi.fn();
    const reserve = vi.fn((): TUploadAdmissionResult => {
      queueMicrotask(() => {
        clock.nowValue = IDLE_TIMEOUT_MS;
      });
      return {
        admitted: true,
        lease: { ownerId: Symbol('expired'), signal: controller.signal, release },
      };
    });
    const harness = createHarness({
      clock,
      admission: { reserve, shutdown: vi.fn() },
    });
    const response = createResponse();

    await harness.server.handleRequest(
      createRequest({ rawHeaders: [
        'Host', 'localhost:3000',
        'Content-Length', '1',
        'Expect', '100-continue',
      ] }),
      asResponse(response),
      { expectContinue: true },
    );

    expect(response.writeContinue).not.toHaveBeenCalled();
    expect(harness.streamArtifact).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expectJsonResponse(response, 408, {
      code: 'upload-timeout',
      error: 'Upload timed out',
    });
  });

  it('destroys the socket and propagates the same error when writeContinue throws', async () => {
    const error = new Error('continue failed');
    const harness = createHarness();
    const request = createRequest({ rawHeaders: [
      'Host', 'localhost:3000',
      'Content-Length', '1',
      'Expect', '100-continue',
    ] });
    const response = createResponse(false);
    response.writeContinue.mockImplementationOnce(() => {
      throw error;
    });

    await expect(harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: true },
    )).rejects.toBe(error);

    expect(response.socket.destroy).toHaveBeenCalledTimes(1);
    expect(harness.streamArtifact).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(response.end).not.toHaveBeenCalled();
    expect(request.listenerCount('aborted')).toBe(0);
    expect(request.listenerCount('error')).toBe(0);
    expect(request.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(harness.clock.timers.filter((timer) =>
      timer.delayMs === IDLE_TIMEOUT_MS || timer.delayMs === ABSOLUTE_TIMEOUT_MS
    ).every((timer) => timer.cleared)).toBe(true);
  });

  it('waits for response finish before closing the socket', async () => {
    const harness = createHarness();
    const request = createRequest({ rawHeaders: ['Content-Length', '1'] });
    const response = createResponse(false);

    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(response.end).toHaveBeenCalledTimes(1));
    expect(response.socket.end).not.toHaveBeenCalled();

    response.emit('finish');
    await handling;
    expect(response.socket.end).toHaveBeenCalledTimes(1);
  });

  it.each(['close', 'error'] as const)('releases the response waiter on %s', async (event) => {
    const harness = createHarness();
    const request = createRequest({ rawHeaders: ['Content-Length', '1'] });
    const response = createResponse(false);
    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(response.end).toHaveBeenCalledTimes(1));
    response.socket.destroyed = true;

    response.emit(event, event === 'error' ? new Error('transport') : undefined);
    await handling;
    expect(response.socket.end).not.toHaveBeenCalled();
  });

  it.each(['setHeader', 'end'] as const)(
    'contains response %s failures without removing unrelated listeners',
    async (operation) => {
      const harness = createHarness();
      const response = createResponse(false);
      const unrelatedFinish = vi.fn();
      const unrelatedClose = vi.fn();
      response.on('finish', unrelatedFinish);
      response.on('close', unrelatedClose);
      response[operation].mockImplementationOnce(() => {
        throw new Error(`response ${operation} failed`);
      });

      await expect(harness.server.handleRequest(
        createRequest({ rawHeaders: ['Content-Length', '1'] }),
        asResponse(response),
        { expectContinue: false },
      )).resolves.toBeUndefined();

      expect(response.listenerCount('finish')).toBe(1);
      expect(response.listenerCount('close')).toBe(1);
      expect(response.socket.destroy).toHaveBeenCalledTimes(1);
    },
  );

  it('falls back to destroying the socket when graceful response close throws', async () => {
    const harness = createHarness();
    const response = createResponse();
    response.socket.end.mockImplementationOnce(() => {
      throw new Error('socket end failed');
    });

    await expect(harness.server.handleRequest(
      createRequest({ rawHeaders: ['Content-Length', '1'] }),
      asResponse(response),
      { expectContinue: false },
    )).resolves.toBeUndefined();

    expect(response.socket.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('upload server transaction lifecycle', () => {
  it.each(['success', 'failure'] as const)(
    'removes transaction timers and listeners after settled %s',
    async (terminal) => {
      const streamArtifact = vi.fn(async (): Promise<TUploadTransactionResult> =>
        terminal === 'success' ? committedResult() : failureResult('length-mismatch'));
      const harness = createHarness({ streamArtifact });
      const addAbortListener = vi.spyOn(harness.lease.signal, 'addEventListener');
      const removeAbortListener = vi.spyOn(harness.lease.signal, 'removeEventListener');
      const request = createRequest();
      const response = createResponse();

      await harness.server.handleRequest(
        request,
        asResponse(response),
        { expectContinue: false },
      );

      expect(request.listenerCount('aborted')).toBe(0);
      expect(request.listenerCount('error')).toBe(0);
      expect(request.listenerCount('close')).toBe(0);
      expect(response.listenerCount('error')).toBe(0);
      expect(response.listenerCount('close')).toBe(0);
      expect(response.listenerCount('finish')).toBe(0);
      expect(addAbortListener).toHaveBeenCalledTimes(1);
      expect(removeAbortListener).toHaveBeenCalledTimes(1);
      const transactionTimers = harness.clock.timers.filter((timer) =>
        timer.delayMs === IDLE_TIMEOUT_MS || timer.delayMs === ABSOLUTE_TIMEOUT_MS);
      expect(transactionTimers).toHaveLength(2);
      expect(transactionTimers.every((timer) => timer.cleared)).toBe(true);
      expect(harness.release).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['upload-aborted', 400, 'invalid-upload-request', 'Invalid upload request'],
    ['length-mismatch', 400, 'invalid-upload-request', 'Invalid upload request'],
    ['upload-timeout', 408, 'upload-timeout', 'Upload timed out'],
    ['payload-too-large', 413, 'payload-too-large', 'File exceeds 50MB'],
    ['storage-failure', 500, 'storage-failure', 'Failed to save file'],
    ['upload-server-shutting-down', 503, 'upload-server-shutting-down', 'Upload unavailable'],
  ] as const)('maps storage result %s', async (reason, statusCode, code, error) => {
    const streamArtifact = vi.fn(async () => failureResult(reason));
    const harness = createHarness({ streamArtifact });
    const request = createRequest();
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, statusCode, { code, error });
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(logMocks.error.mock.calls.flat().join(' ')).not.toContain('/safe/');
  });

  it.each(['error', 'incomplete-close'] as const)(
    'keeps active request %s as the first terminal cause',
    async (terminal) => {
      let captured: IStreamUploadArtifactInput | null = null;
      const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
        captured = input;
        return new Promise<TUploadTransactionResult>((resolve) => {
          input.signal.addEventListener('abort', () => {
            resolve(failureResult('upload-aborted'));
          }, { once: true });
        });
      });
      const harness = createHarness({ streamArtifact });
      const request = createRequest({ complete: false });
      const response = createResponse();
      const handling = harness.server.handleRequest(
        request,
        asResponse(response),
        { expectContinue: false },
      );
      await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));

      if (terminal === 'error') request.emit('error', new Error('request failed'));
      else request.emit('close');
      await handling;

      const input = requireValue<IStreamUploadArtifactInput>(captured);
      expect(input.signal.reason).toBe('upload-aborted');
      expectJsonResponse(response, 400, {
        code: 'invalid-upload-request',
        error: 'Invalid upload request',
      });
      expect(harness.release).toHaveBeenCalledTimes(1);
      expect(request.listenerCount('aborted')).toBe(0);
      expect(request.listenerCount('error')).toBe(0);
      expect(request.listenerCount('close')).toBe(0);
      expect(response.listenerCount('error')).toBe(0);
      expect(response.listenerCount('close')).toBe(0);
      expect(harness.clock.timers.every((timer) => timer.cleared)).toBe(true);
    },
  );

  it('preserves timeout when request close and shutdown race afterward', async () => {
    const storage = deferred<TUploadTransactionResult>();
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return storage.promise;
    });
    const harness = createHarness({ streamArtifact });
    const request = createRequest({ complete: false });
    const response = createResponse();
    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    const idleTimer = harness.clock.latest(IDLE_TIMEOUT_MS);
    const absoluteTimer = harness.clock.latest(ABSOLUTE_TIMEOUT_MS);

    harness.clock.fire(idleTimer);
    request.emit('close');
    const shutdown = harness.server.shutdown();
    storage.resolve(failureResult('upload-timeout'));
    await Promise.all([handling, shutdown]);

    const input = requireValue<IStreamUploadArtifactInput>(captured);
    expect(input.signal.reason).toBe('upload-timeout');
    expectJsonResponse(response, 408, {
      code: 'upload-timeout',
      error: 'Upload timed out',
    });
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(idleTimer.cleared).toBe(true);
    expect(absoluteTimer.cleared).toBe(true);
    expect(request.listenerCount('error')).toBe(0);
    expect(request.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('preserves a storage failure that settles before a request abort', async () => {
    const storage = deferred<TUploadTransactionResult>();
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return storage.promise;
    });
    const harness = createHarness({ streamArtifact });
    const request = createRequest();
    const response = createResponse();
    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    const idleTimer = harness.clock.latest(IDLE_TIMEOUT_MS);
    const absoluteTimer = harness.clock.latest(ABSOLUTE_TIMEOUT_MS);

    storage.resolve(failureResult('storage-failure'));
    request.emit('aborted');
    await handling;

    const input = requireValue<IStreamUploadArtifactInput>(captured);
    expect(input.signal.reason).toBe('upload-aborted');
    expectJsonResponse(response, 500, {
      code: 'storage-failure',
      error: 'Failed to save file',
    });
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(idleTimer.cleared).toBe(true);
    expect(absoluteTimer.cleared).toBe(true);
    expect(request.listenerCount('aborted')).toBe(0);
    expect(request.listenerCount('error')).toBe(0);
    expect(request.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('maps by stable reason and promotes failed cleanup to storage-failure', async () => {
    const inconsistent: TUploadTransactionResult = {
      committed: false,
      statusCode: 500,
      reason: 'length-mismatch',
      cleanup: 'complete',
    };
    const failedCleanup: TUploadTransactionResult = {
      committed: false,
      statusCode: 408,
      reason: 'upload-timeout',
      cleanup: 'failed',
    };
    const streamArtifact = vi.fn()
      .mockResolvedValueOnce(inconsistent)
      .mockResolvedValueOnce(failedCleanup);
    const harness = createHarness({ streamArtifact });
    const first = createResponse();
    const second = createResponse();

    await harness.server.handleRequest(createRequest(), asResponse(first), { expectContinue: false });
    await harness.server.handleRequest(createRequest(), asResponse(second), { expectContinue: false });

    expectJsonResponse(first, 400, {
      code: 'invalid-upload-request',
      error: 'Invalid upload request',
    });
    expectJsonResponse(second, 500, {
      code: 'storage-failure',
      error: 'Failed to save file',
    });
  });

  it('uses policy-specific image storage errors', async () => {
    const streamArtifact = vi.fn(async () => failureResult('storage-failure'));
    const harness = createHarness({ streamArtifact });
    const request = createRequest({
      url: '/api/upload-image',
      rawHeaders: [
        'Host', 'localhost:3000',
        'Content-Length', '1',
        'Content-Type', 'image/png',
      ],
    });
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });

    expectJsonResponse(response, 500, { code: 'storage-failure', error: 'Failed to save image' });
  });

  it('resets idle timeout only from storage progress and ignores cleared callbacks', async () => {
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return new Promise<TUploadTransactionResult>((resolve) => {
        input.signal.addEventListener('abort', () => {
          resolve(failureResult(input.signal.reason === 'upload-server-shutting-down'
            ? 'upload-server-shutting-down'
            : 'upload-timeout'));
        }, { once: true });
      });
    });
    const harness = createHarness({ streamArtifact });
    const request = createRequest();
    const response = createResponse();
    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    const input = requireValue<IStreamUploadArtifactInput>(captured);
    const firstIdle = harness.clock.latest(IDLE_TIMEOUT_MS);
    const absolute = harness.clock.latest(ABSOLUTE_TIMEOUT_MS);

    input.onProgress();
    const secondIdle = harness.clock.latest(IDLE_TIMEOUT_MS);
    expect(firstIdle.cleared).toBe(true);
    expect(secondIdle).not.toBe(firstIdle);
    harness.clock.fire(firstIdle);
    expect(input.signal.aborted).toBe(false);
    expect(harness.lease.signal.aborted).toBe(false);

    harness.clock.fire(secondIdle);
    expect(input.signal.aborted).toBe(true);
    expect(input.signal.reason).toBe('upload-timeout');
    expect(harness.lease.signal.aborted).toBe(false);
    expect(absolute.cleared).toBe(false);
    await handling;
    expectJsonResponse(response, 408, { code: 'upload-timeout', error: 'Upload timed out' });
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('enforces the absolute timeout independently of progress', async () => {
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return new Promise<TUploadTransactionResult>((resolve) => {
        input.signal.addEventListener('abort', () => resolve(failureResult('upload-timeout')), {
          once: true,
        });
      });
    });
    const harness = createHarness({ streamArtifact });
    const response = createResponse();
    const handling = harness.server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    const input = requireValue<IStreamUploadArtifactInput>(captured);
    input.onProgress();
    harness.clock.fire(harness.clock.latest(ABSOLUTE_TIMEOUT_MS));

    await handling;
    expect(input.signal.reason).toBe('upload-timeout');
    expectJsonResponse(response, 408, { code: 'upload-timeout', error: 'Upload timed out' });
  });

  it('forwards the fixed admission shutdown reason to a request-scoped controller', async () => {
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return new Promise<TUploadTransactionResult>((resolve) => {
        input.signal.addEventListener('abort', () => {
          resolve(failureResult('upload-server-shutting-down'));
        }, { once: true });
      });
    });
    const harness = createHarness({ streamArtifact });
    const response = createResponse();
    const handling = harness.server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));

    harness.leaseController.abort('upload-server-shutting-down');
    await handling;

    const input = requireValue<IStreamUploadArtifactInput>(captured);
    expect(input.signal).not.toBe(harness.lease.signal);
    expect(input.signal.reason).toBe('upload-server-shutting-down');
    expectJsonResponse(response, 503, {
      code: 'upload-server-shutting-down',
      error: 'Upload unavailable',
    });
  });

  it('does not claim an application timeout after transport preemption', async () => {
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return new Promise<TUploadTransactionResult>((resolve) => {
        input.signal.addEventListener('abort', () => resolve(failureResult('upload-aborted')), {
          once: true,
        });
      });
    });
    const harness = createHarness({ streamArtifact });
    const request = createRequest();
    const response = createResponse(false);
    const handling = harness.server.handleRequest(
      request,
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));

    response.destroyed = true;
    response.socket.destroyed = true;
    request.emit('aborted');
    response.emit('close');
    harness.clock.fire(harness.clock.latest(IDLE_TIMEOUT_MS));
    await handling;

    const input = requireValue<IStreamUploadArtifactInput>(captured);
    expect(input.signal.reason).toBe('upload-aborted');
    expect(response.end).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed result when the response disconnect wins delivery', async () => {
    const storage = deferred<TUploadTransactionResult>();
    let captured: IStreamUploadArtifactInput | null = null;
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) => {
      captured = input;
      return storage.promise;
    });
    const harness = createHarness({ streamArtifact });
    const response = createResponse(false);
    const handling = harness.server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    response.destroyed = true;
    response.socket.destroyed = true;
    response.emit('close');
    storage.resolve(committedResult());

    await handling;
    const input = requireValue<IStreamUploadArtifactInput>(captured);
    expect(input.signal.reason).toBe('upload-aborted');
    expect(response.end).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('tracks work before reentrant shutdown and awaits the transaction', async () => {
    const storage = deferred<TUploadTransactionResult>();
    const serverRef: { current: IUploadServer | null } = { current: null };
    let shutdownPromise: Promise<void> | null = null;
    const streamArtifact = vi.fn(() => {
      shutdownPromise = requireValue(serverRef.current).shutdown();
      return storage.promise;
    });
    const harness = createHarness({ streamArtifact });
    const server = harness.server;
    serverRef.current = server;
    const response = createResponse();
    const handling = server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    const activeShutdown = requireValue<Promise<void>>(shutdownPromise);
    let shutdownSettled = false;
    void activeShutdown.then(() => {
      shutdownSettled = true;
    });
    await flush();
    expect(shutdownSettled).toBe(false);

    storage.resolve(committedResult());
    await handling;
    await activeShutdown;
    expect(shutdownSettled).toBe(true);
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('propagates rejected storage programming errors while cleanup remains shutdown-safe', async () => {
    const error = new Error('/private/storage/path');
    const streamArtifact = vi.fn(async () => {
      throw error;
    });
    const harness = createHarness({ streamArtifact });
    const response = createResponse();

    await expect(harness.server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    )).rejects.toBe(error);

    expect(response.end).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledTimes(1);
    await expect(harness.server.shutdown()).resolves.toBeUndefined();
    expect(logMocks.error.mock.calls.flat().join(' ')).not.toContain('/private/storage/path');
  });

  it('propagates admission and clock programming errors after releasing owned state', async () => {
    const admissionError = new Error('admission bug');
    const admission = {
      reserve: vi.fn(() => {
        throw admissionError;
      }),
      shutdown: vi.fn(),
    };
    const admissionHarness = createHarness({ admission });
    await expect(admissionHarness.server.handleRequest(
      createRequest(),
      asResponse(createResponse()),
      { expectContinue: false },
    )).rejects.toBe(admissionError);

    const clock = new FakeClock();
    clock.throwOnSet = new Error('clock bug');
    const clockHarness = createHarness({ clock });
    await expect(clockHarness.server.handleRequest(
      createRequest(),
      asResponse(createResponse()),
      { expectContinue: false },
    )).rejects.toThrow('clock bug');
    expect(clockHarness.release).toHaveBeenCalledTimes(1);

    const nowClock = new FakeClock();
    const nowError = new Error('clock now bug');
    nowClock.throwOnNow = nowError;
    const nowHarness = createHarness({ clock: nowClock });
    await expect(nowHarness.server.handleRequest(
      createRequest(),
      asResponse(createResponse()),
      { expectContinue: false },
    )).rejects.toBe(nowError);
    expect(nowHarness.reserve).toHaveBeenCalledTimes(1);
    expect(nowHarness.streamArtifact).not.toHaveBeenCalled();
    expect(nowHarness.release).toHaveBeenCalledTimes(1);

    const clearClock = new FakeClock();
    const clearError = new Error('clock clear bug');
    clearClock.throwOnClear = clearError;
    const clearHarness = createHarness({ clock: clearClock });
    const clearRequest = createRequest();
    const clearResponse = createResponse();
    await expect(clearHarness.server.handleRequest(
      clearRequest,
      asResponse(clearResponse),
      { expectContinue: false },
    )).rejects.toBe(clearError);
    expect(clearHarness.release).toHaveBeenCalledTimes(1);
    expect(clearRequest.listenerCount('aborted')).toBe(0);
    expect(clearRequest.listenerCount('error')).toBe(0);
    expect(clearRequest.listenerCount('close')).toBe(0);
    expect(clearResponse.listenerCount('error')).toBe(0);
    expect(clearResponse.listenerCount('close')).toBe(0);
    expect(clearClock.timers.every((timer) => timer.cleared)).toBe(true);
  });
});

describe('upload server maintenance and shutdown', () => {
  it('publishes startup state before synchronous cleanup reenters start', async () => {
    const serverRef: { current: IUploadServer | null } = { current: null };
    let reentrantStart: Promise<void> | null = null;
    const cleanupStaleParts = vi.fn(() => {
      if (!reentrantStart) reentrantStart = requireValue(serverRef.current).start();
      return Promise.resolve({ deleted: 0, freedBytes: 0 });
    });
    const harness = createHarness({ cleanupStaleParts });
    serverRef.current = harness.server;

    const initialStart = harness.server.start();
    await vi.waitFor(() => expect(reentrantStart).not.toBeNull());
    const nestedStart = requireValue<Promise<void>>(reentrantStart);
    await Promise.all([initialStart, nestedStart]);

    expect(nestedStart).toBe(initialStart);
    expect(cleanupStaleParts).toHaveBeenCalledTimes(1);
    const maintenanceTimers = harness.clock.timers.filter((timer) =>
      timer.delayMs === MAINTENANCE_INTERVAL_MS);
    expect(maintenanceTimers).toHaveLength(1);
    expect(maintenanceTimers[0].unref).toHaveBeenCalledTimes(1);
  });

  it('starts cleanup once and runs unrefed, recursive, non-overlapping maintenance', async () => {
    const maintenance = deferred<{ deleted: number; freedBytes: number }>();
    const cleanupStaleParts = vi.fn()
      .mockResolvedValueOnce({ deleted: 0, freedBytes: 0 })
      .mockImplementationOnce(() => maintenance.promise)
      .mockResolvedValue({ deleted: 0, freedBytes: 0 });
    const harness = createHarness({ cleanupStaleParts });

    await Promise.all([harness.server.start(), harness.server.start()]);
    expect(cleanupStaleParts).toHaveBeenCalledTimes(1);
    const timer = harness.clock.latest(MAINTENANCE_INTERVAL_MS);
    expect(timer.unref).toHaveBeenCalledTimes(1);

    harness.clock.fire(timer);
    harness.clock.fire(timer);
    await flush();
    expect(cleanupStaleParts).toHaveBeenCalledTimes(2);
    expect(harness.clock.timers.filter((candidate) =>
      candidate.delayMs === MAINTENANCE_INTERVAL_MS)).toHaveLength(1);

    maintenance.resolve({ deleted: 0, freedBytes: 0 });
    await flush();
    const timers = harness.clock.timers.filter((candidate) =>
      candidate.delayMs === MAINTENANCE_INTERVAL_MS);
    expect(timers).toHaveLength(2);
    expect(timers[1].unref).toHaveBeenCalledTimes(1);
    harness.clock.fire(timer);
    await flush();
    expect(cleanupStaleParts).toHaveBeenCalledTimes(2);
  });

  it.each(['setTimeout', 'unref'] as const)(
    'isolates recursive maintenance %s failures without duplicate scheduling',
    async (operation) => {
      const clock = new FakeClock();
      const cleanupStaleParts = vi.fn(async () => ({ deleted: 0, freedBytes: 0 }));
      const harness = createHarness({ clock, cleanupStaleParts });
      await harness.server.start();
      const initialTimer = clock.latest(MAINTENANCE_INTERVAL_MS);
      const error = new Error(`recursive ${operation} failed`);
      if (operation === 'setTimeout') clock.throwOnSet = error;
      else clock.throwOnUnref = error;

      clock.fire(initialTimer);
      await flush();

      expect(cleanupStaleParts).toHaveBeenCalledTimes(2);
      expect(logMocks.warn).toHaveBeenCalledTimes(1);
      expect(logMocks.warn).toHaveBeenCalledWith('upload-maintenance-schedule-failed');
      expect(logMocks.warn.mock.calls.flat().join(' ')).not.toContain(error.message);
      const timers = clock.timers.filter((timer) => timer.delayMs === MAINTENANCE_INTERVAL_MS);
      expect(timers).toHaveLength(operation === 'setTimeout' ? 1 : 2);
      if (operation === 'unref') expect(timers[1].cleared).toBe(true);

      for (const timer of timers) clock.fire(timer);
      await flush();
      expect(cleanupStaleParts).toHaveBeenCalledTimes(2);
      expect(logMocks.warn).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['setTimeout', 'unref'] as const)(
    'preserves initial start %s programming errors',
    async (operation) => {
      const clock = new FakeClock();
      const error = new Error(`initial ${operation} failed`);
      if (operation === 'setTimeout') clock.throwOnSet = error;
      else clock.throwOnUnref = error;
      const harness = createHarness({ clock });

      await expect(harness.server.start()).rejects.toBe(error);

      expect(logMocks.warn).not.toHaveBeenCalledWith('upload-maintenance-schedule-failed');
    },
  );

  it('isolates maintenance failures with a sanitized code', async () => {
    const cleanupStaleParts = vi.fn(async () => {
      throw new Error('/private/stage/path');
    });
    const harness = createHarness({ cleanupStaleParts });

    await harness.server.start();

    expect(logMocks.warn).toHaveBeenCalledWith('upload-maintenance-failed');
    expect(logMocks.warn.mock.calls.flat().join(' ')).not.toContain('/private/stage/path');
    expect(harness.clock.latest(MAINTENANCE_INTERVAL_MS).unref).toHaveBeenCalledTimes(1);
  });

  it('awaits initial cleanup during shutdown and never schedules afterward', async () => {
    const cleanup = deferred<{ deleted: number; freedBytes: number }>();
    const cleanupStaleParts = vi.fn(() => cleanup.promise);
    const harness = createHarness({ cleanupStaleParts });
    const starting = harness.server.start();
    await vi.waitFor(() => expect(cleanupStaleParts).toHaveBeenCalledTimes(1));

    let shutdownSettled = false;
    const shutdown = harness.server.shutdown().then(() => {
      shutdownSettled = true;
    });
    await flush();
    expect(shutdownSettled).toBe(false);

    cleanup.resolve({ deleted: 0, freedBytes: 0 });
    await Promise.all([starting, shutdown]);
    expect(harness.clock.timers.filter((timer) =>
      timer.delayMs === MAINTENANCE_INTERVAL_MS)).toHaveLength(0);
    expect(harness.admissionShutdown).toHaveBeenCalledTimes(1);
  });

  it('registers startup cleanup before a reentrant shutdown observes active maintenance', async () => {
    const cleanup = deferred<{ deleted: number; freedBytes: number }>();
    let shutdown: Promise<void> | null = null;
    const serverRef: { current: IUploadServer | null } = { current: null };
    const cleanupStaleParts = vi.fn(() => {
      shutdown = requireValue(serverRef.current).shutdown();
      return cleanup.promise;
    });
    const harness = createHarness({ cleanupStaleParts });
    serverRef.current = harness.server;

    const starting = harness.server.start();
    await vi.waitFor(() => expect(cleanupStaleParts).toHaveBeenCalledTimes(1));
    const activeShutdown = requireValue<Promise<void>>(shutdown);
    let settled = false;
    void activeShutdown.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    cleanup.resolve({ deleted: 0, freedBytes: 0 });
    await Promise.all([starting, activeShutdown]);
    expect(settled).toBe(true);
    expect(harness.clock.timers).toHaveLength(0);
  });

  it('is idempotent and synchronously rejects new requests once shutdown begins', async () => {
    const harness = createHarness();
    harness.server.beginShutdown();
    const request = createRequest();
    const response = createResponse();

    await harness.server.handleRequest(request, asResponse(response), { expectContinue: false });
    await Promise.all([harness.server.shutdown(), harness.server.shutdown()]);

    expectJsonResponse(response, 503, {
      code: 'upload-server-shutting-down',
      error: 'Upload unavailable',
    });
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.admissionShutdown).toHaveBeenCalledTimes(1);
  });

  it('keeps shutdown stable and drains active work when maintenance timer clear throws', async () => {
    const clock = new FakeClock();
    const clearError = new Error('maintenance clear failed');
    const streamArtifact = vi.fn((input: IStreamUploadArtifactInput) =>
      new Promise<TUploadTransactionResult>((resolve) => {
        input.signal.addEventListener('abort', () => {
          resolve(failureResult('upload-server-shutting-down'));
        }, { once: true });
      }));
    const harness = createHarness({ clock, streamArtifact });
    await harness.server.start();
    const maintenanceTimer = clock.latest(MAINTENANCE_INTERVAL_MS);
    const response = createResponse();
    const handling = harness.server.handleRequest(
      createRequest(),
      asResponse(response),
      { expectContinue: false },
    );
    await vi.waitFor(() => expect(streamArtifact).toHaveBeenCalledTimes(1));
    clock.throwOnClear = clearError;
    clock.throwOnClearDelayMs = MAINTENANCE_INTERVAL_MS;

    let firstShutdown: Promise<void> | null = null;
    expect(() => {
      firstShutdown = harness.server.shutdown();
    }).not.toThrow();
    const stableShutdown = requireValue<Promise<void>>(firstShutdown);
    const secondShutdown = harness.server.shutdown();
    expect(secondShutdown).toBe(stableShutdown);
    await expect(stableShutdown).rejects.toBe(clearError);
    expect(harness.server.shutdown()).toBe(stableShutdown);
    await handling;

    expect(maintenanceTimer.cleared).toBe(true);
    expect(harness.admissionShutdown).toHaveBeenCalledTimes(1);
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(streamArtifact.mock.calls[0][0].signal.reason).toBe('upload-server-shutting-down');
    expectJsonResponse(response, 503, {
      code: 'upload-server-shutting-down',
      error: 'Upload unavailable',
    });
  });
});

describe('upload server upgrade attempts', () => {
  it.each([
    ['/api/upload-file', false, false, 400, 'invalid-upload-request'],
    ['/api/./upload-file', false, false, 400, 'invalid-upload-target'],
    ['/api/upload-file', true, false, 503, 'uploads-disabled'],
    ['/api/upload-file', false, true, 503, 'upload-server-shutting-down'],
    ['/api/./upload-file', true, false, 503, 'uploads-disabled'],
    ['/api/./upload-file', false, true, 503, 'upload-server-shutting-down'],
  ] as const)('owns upgrade attempt %s', async (url, disabled, shutdown, status, code) => {
    const harness = createHarness({ disabled });
    if (shutdown) harness.server.beginShutdown();
    const socket = new FakeSocket();

    await harness.server.handleUpgradeAttempt(createRequest({ url }), asSocket(socket));

    expect(socket.end).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
    expect(socket.text()).toContain(`HTTP/1.1 ${status}`);
    expect(socket.text()).toContain(`"code":"${code}"`);
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.streamArtifact).not.toHaveBeenCalled();
  });

  it('leaves unmatched upgrade attempts to the dispatcher', async () => {
    const harness = createHarness();
    const socket = new FakeSocket();

    await harness.server.handleUpgradeAttempt(
      createRequest({ url: '/api/health' }),
      asSocket(socket),
    );

    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.end).not.toHaveBeenCalled();
    expect(harness.authorizeRequest).not.toHaveBeenCalled();
  });

  it('immediately destroys an owned upgrade socket that is no longer writable', async () => {
    const harness = createHarness();
    const socket = new FakeSocket();
    socket.writable = false;

    await harness.server.handleUpgradeAttempt(
      createRequest({ url: '/api/upload-file' }),
      asSocket(socket),
    );

    expect(socket.end).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('awaits raw response flush before destroying an owned upgrade socket', async () => {
    const harness = createHarness();
    const socket = new FakeSocket();
    let flushCallback: (() => void) | null = null;
    socket.end.mockImplementationOnce((chunk?: string | Buffer, callback?: () => void) => {
      if (chunk !== undefined) {
        socket.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      flushCallback = callback ?? null;
      return socket;
    });

    let settled = false;
    const handling = harness.server.handleUpgradeAttempt(
      createRequest({ url: '/api/upload-file' }),
      asSocket(socket),
    ).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(flushCallback).not.toBeNull());
    await flush();
    expect(settled).toBe(false);
    expect(socket.destroy).not.toHaveBeenCalled();

    requireValue<() => void>(flushCallback)();
    await handling;
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps the raw error listener after an end callback reports failure', async () => {
    const harness = createHarness();
    const socket = new FakeSocket();
    const unrelatedClose = vi.fn();
    socket.on('close', unrelatedClose);
    let endCallback: ((error?: Error | null) => void) | null = null;
    socket.end.mockImplementationOnce((chunk?: string | Buffer, callback?: () => void) => {
      if (chunk !== undefined) {
        socket.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      endCallback = callback ?? null;
      return socket;
    });
    let settled = false;
    const handling = harness.server.handleUpgradeAttempt(
      createRequest({ url: '/api/upload-file' }),
      asSocket(socket),
    ).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(endCallback).not.toBeNull());
    const transportError = Object.assign(new Error('write failed'), { code: 'ECONNRESET' });

    requireValue<(error?: Error | null) => void>(endCallback)(transportError);
    await flush();
    const settledAfterCallback = settled;
    let emittedError: unknown;
    try {
      socket.emit('error', transportError);
    } catch (error) {
      emittedError = error;
    }
    await handling;

    expect(settledAfterCallback).toBe(false);
    expect(emittedError).toBeUndefined();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(unrelatedClose).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('close')).toBe(1);
  });

  it.each(['ECONNRESET', 'EPIPE', 'close'] as const)(
    'settles raw upgrade close exactly once on asynchronous %s',
    async (terminal) => {
      const harness = createHarness();
      const socket = new FakeSocket();
      const unrelatedError = vi.fn();
      const unrelatedClose = vi.fn();
      socket.on('error', unrelatedError);
      socket.on('close', unrelatedClose);
      let flushCallback: (() => void) | null = null;
      socket.end.mockImplementationOnce((chunk?: string | Buffer, callback?: () => void) => {
        if (chunk !== undefined) {
          socket.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        flushCallback = callback ?? null;
        return socket;
      });
      const handling = harness.server.handleUpgradeAttempt(
        createRequest({ url: '/api/upload-file' }),
        asSocket(socket),
      );
      await vi.waitFor(() => expect(flushCallback).not.toBeNull());

      if (terminal === 'close') {
        socket.emit('close');
      } else {
        socket.emit('error', Object.assign(new Error('transport reset'), { code: terminal }));
      }
      await handling;

      expect(socket.destroy).toHaveBeenCalledTimes(1);
      expect(socket.listenerCount('error')).toBe(1);
      expect(socket.listenerCount('close')).toBe(1);
      requireValue<() => void>(flushCallback)();
      socket.emit('close');
      socket.emit('error', Object.assign(new Error('late transport error'), { code: 'EPIPE' }));
      expect(socket.destroy).toHaveBeenCalledTimes(1);
      expect(socket.listenerCount('error')).toBe(1);
      expect(socket.listenerCount('close')).toBe(1);
    },
  );

  it('destroys an owned upgrade socket when raw response end throws', async () => {
    const harness = createHarness();
    const socket = new FakeSocket();
    const unrelatedError = vi.fn();
    const unrelatedClose = vi.fn();
    socket.on('error', unrelatedError);
    socket.on('close', unrelatedClose);
    socket.end.mockImplementationOnce(() => {
      throw new Error('upgrade end failed');
    });

    await expect(harness.server.handleUpgradeAttempt(
      createRequest({ url: '/api/upload-file' }),
      asSocket(socket),
    )).resolves.toBeUndefined();

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('error')).toBe(1);
    expect(socket.listenerCount('close')).toBe(1);
  });
});
