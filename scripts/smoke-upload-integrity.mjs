#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import http from 'http';
import net from 'net';
import path from 'path';
import {
  buildIsolatedServerEnv,
  buildUploadHeaders,
  createIsolatedHome,
  discoverServerPort,
  extractSessionCookie,
  getFreePort,
  getServerCommand,
  parseRawHttpResponses,
  pathExists,
  readBuildId,
  scanUploadArtifacts,
  sha256File,
  sha256Repeated,
  spawnManagedProcess,
  waitFor,
  writeRepeatedFile,
} from './smoke-upload-integrity-lib.mjs';

const MODE = process.env.CODEXMUX_UPLOAD_SMOKE_MODE;
const MIB = 1024 * 1024;
const IMAGE_LIMIT = 10 * MIB;
const FILE_LIMIT = 50 * MIB;
const PASSWORD = 'upload-integrity-password';
const INIT_PASSWORD = 'upload-integrity-init';
const STARTUP_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const LARGE_REQUEST_TIMEOUT_MS = 180_000;
const IDLE_TIMEOUT_DEADLINE_MS = 75_000;
const rootDir = process.cwd();
const checks = [];
const processStates = [];
const rawConnections = new Set();
let home;
let serverState;
let browser;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const addCheck = (name) => checks.push(name);

const parseJson = (response, label = 'response') => {
  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error(`${label} expected JSON, got ${response.status}: ${response.text.slice(0, 300)}`);
  }
};

const request = ({
  port,
  pathname,
  method = 'GET',
  headers = {},
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: pathname,
    method,
    headers,
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    res.once('error', reject);
    res.once('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        buffer,
        text: buffer.toString('utf8'),
      });
    });
  });
  req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timed out: ${pathname}`)));
  req.once('error', reject);
  if (body && typeof body.pipe === 'function') {
    body.once('error', (error) => req.destroy(error));
    body.pipe(req);
  } else {
    req.end(body);
  }
});

const jsonRequest = ({
  port,
  pathname,
  method = 'GET',
  cookie,
  token,
  body,
  origin,
}) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = {
    Host: `127.0.0.1:${port}`,
    Connection: 'close',
  };
  if (cookie) headers.Cookie = cookie;
  if (token) headers['X-Cmux-Token'] = token;
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(payload));
    headers.Origin = origin ?? `http://127.0.0.1:${port}`;
  } else if (origin) {
    headers.Origin = origin;
  }
  return request({ port, pathname, method, headers, body: payload });
};

const login = async (port, password) => {
  const response = await jsonRequest({
    port,
    pathname: '/api/auth/login',
    method: 'POST',
    body: { password },
  });
  return { response, cookie: extractSessionCookie(response.headers) };
};

const createWarningScanner = (managed) => {
  const pattern = /Request body exceeded 10\s*MB/i;
  let tail = '';
  let matched = false;
  const scan = (chunk) => {
    const combined = tail + chunk.toString();
    if (pattern.test(combined)) matched = true;
    tail = combined.slice(-160);
  };
  managed.child.stdout?.on('data', scan);
  managed.child.stderr?.on('data', scan);
  return () => matched;
};

const startServer = async ({ extra = {} } = {}) => {
  const requestedPort = await getFreePort();
  const env = buildIsolatedServerEnv({
    home,
    port: requestedPort,
    mode: MODE,
    extra,
  });
  const command = getServerCommand({ mode: MODE });
  const managed = spawnManagedProcess({
    ...command,
    cwd: rootDir,
    env,
  });
  const hasBodyWarning = createWarningScanner(managed);
  const state = { ...managed, hasBodyWarning, requestedPort, port: 0 };
  processStates.push(state);
  try {
    state.port = await discoverServerPort({
      home,
      processState: managed,
      timeoutMs: STARTUP_TIMEOUT_MS,
      probe: async (candidate) => {
        const health = await request({
          port: candidate,
          pathname: '/api/health',
          timeoutMs: 1_000,
        }).catch(() => null);
        return health?.status === 200;
      },
    });
    return state;
  } catch (error) {
    await managed.stop();
    throw new Error(`${error instanceof Error ? error.message : error}\n${managed.getOutput().slice(-4_000)}`);
  }
};

const stopServer = async (state, deadlineMs = 15_000) => {
  if (!state) return;
  const startedAt = Date.now();
  await state.stop();
  await waitFor('server listener close', async () => {
    const socket = net.createConnection({ host: '127.0.0.1', port: state.port });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (closed) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(closed);
      };
      socket.setTimeout(250, () => finish(true));
      socket.once('connect', () => finish(false));
      socket.once('error', () => finish(true));
    });
  }, deadlineMs);
  const elapsedMs = Date.now() - startedAt;
  assert(elapsedMs <= deadlineMs, `server shutdown exceeded ${deadlineMs}ms: ${elapsedMs}ms`);
  assert(
    state.child.exitCode === 0
      || state.child.exitCode === 130
      || state.child.signalCode === 'SIGINT',
    `server exited unexpectedly: ${state.child.exitCode}\n${state.getOutput().slice(-4_000)}`,
  );
};

const uploadsRoot = () => path.join(home, '.codexmux', 'uploads');

const assertStoredArtifact = async (payload, expectedBytes, label) => {
  assert(typeof payload?.path === 'string', `${label} response path missing`);
  assert(typeof payload?.filename === 'string', `${label} response filename missing`);
  const relative = path.relative(uploadsRoot(), payload.path);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${label} escaped upload root`);
  const stat = await fs.stat(payload.path);
  assert(stat.size === expectedBytes, `${label} expected ${expectedBytes} bytes, got ${stat.size}`);
  if (process.platform !== 'win32') {
    assert((stat.mode & 0o777) === 0o600, `${label} mode expected 0600`);
  }
  return payload.path;
};

const waitForNoArtifacts = async (label) => waitFor(label, async () => {
  const scan = await scanUploadArtifacts(home);
  return scan.all.length === 0 ? scan : null;
}, 15_000);

const cleanupUploads = async (port, cookie) => {
  const response = await jsonRequest({
    port,
    pathname: '/api/uploads/cleanup',
    method: 'POST',
    cookie,
    body: { mode: 'all' },
  });
  assert(response.status === 200, `upload cleanup failed: ${response.status} ${response.text}`);
  await waitForNoArtifacts('upload cleanup');
};

const setupFreshHome = async () => {
  const setupServer = await startServer({ extra: { INIT_PASSWORD } });
  try {
    const setupState = await jsonRequest({ port: setupServer.port, pathname: '/api/auth/setup' });
    const state = parseJson(setupState, 'setup state');
    assert(setupState.status === 200, `setup state failed: ${setupState.status}`);
    assert(state.needsSetup === true && state.requiresAuth === true, 'fresh setup state mismatch');

    const initial = await login(setupServer.port, INIT_PASSWORD);
    assert(initial.response.status === 200 && initial.cookie, 'INIT_PASSWORD login failed');
    const setup = await jsonRequest({
      port: setupServer.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      cookie: initial.cookie,
      body: {
        authPassword: PASSWORD,
        locale: 'ko',
        appTheme: 'dark',
        dangerouslySkipPermissions: false,
        networkAccess: 'localhost',
      },
    });
    assert(setup.status === 200, `setup claim failed: ${setup.status} ${setup.text}`);

    const configured = await login(setupServer.port, PASSWORD);
    assert(configured.response.status === 200 && configured.cookie, 'configured login after setup failed');
  } finally {
    await stopServer(setupServer);
  }

  serverState = await startServer();
  const configuredState = await jsonRequest({ port: serverState.port, pathname: '/api/auth/setup' });
  const state = parseJson(configuredState, 'configured setup state');
  assert(configuredState.status === 200 && state.needsSetup === false, 'configured restart setup state mismatch');
  const configured = await login(serverState.port, PASSWORD);
  assert(configured.response.status === 200 && configured.cookie, 'configured restart login failed');
  const tokenPath = path.join(home, '.codexmux', 'cli-token');
  const cliToken = await waitFor('CLI token', async () => {
    const value = (await fs.readFile(tokenPath, 'utf8').catch(() => '')).trim();
    return value || null;
  });
  addCheck('01-setup-configured-login');
  return { cookie: configured.cookie, cliToken };
};

const uploadBuffer = async ({
  port,
  pathname = '/api/upload-file',
  credential,
  origin,
  buffer = Buffer.from('x'),
  contentType = 'application/octet-stream',
  filename = 'small.bin',
  extraHeaders = {},
}) => {
  const headers = buildUploadHeaders({
    port,
    credential,
    contentLength: buffer.length,
    contentType,
    filename,
    workspaceId: 'smoke-ws',
    tabId: 'smoke-tab',
    origin,
  });
  Object.assign(headers, extraHeaders);
  return request({ port, pathname, method: 'POST', headers, body: buffer });
};

const runAuthorityMatrix = async ({ cookie, cliToken }) => {
  const port = serverState.port;
  const body = Buffer.alloc(1024, 0x61);
  const scenarios = [
    ['unauthenticated', null, `http://127.0.0.1:${port}`, {}, 401],
    ['session-same-origin', { kind: 'session', cookie }, undefined, {}, 200],
    ['session-missing-origin', { kind: 'session', cookie }, null, {}, 403],
    ['session-attacker-origin', { kind: 'session', cookie }, 'http://attacker.invalid', {}, 403],
    ['cli-missing-origin', { kind: 'cli', token: cliToken }, null, {}, 200],
    ['cli-same-origin', { kind: 'cli', token: cliToken }, `http://127.0.0.1:${port}`, {}, 200],
    ['cli-attacker-origin', { kind: 'cli', token: cliToken }, 'http://attacker.invalid', {}, 403],
    ['invalid-cli-session-fallback', { kind: 'session', cookie }, undefined, { 'X-Cmux-Token': 'invalid' }, 200],
    ['dual-valid-cli-precedence', { kind: 'cli', token: cliToken }, null, { Cookie: cookie }, 200],
  ];

  for (const [label, credential, origin, extraHeaders, status] of scenarios) {
    const before = await scanUploadArtifacts(home);
    const response = await uploadBuffer({
      port,
      credential,
      origin,
      buffer: body,
      filename: `${label}.bin`,
      extraHeaders,
    });
    assert(response.status === status, `${label} expected ${status}, got ${response.status}: ${response.text}`);
    if (status === 200) {
      await assertStoredArtifact(parseJson(response, label), body.length, label);
    } else {
      const after = await scanUploadArtifacts(home);
      assert(after.all.length === before.all.length, `${label} created an artifact`);
    }
  }
  await cleanupUploads(port, cookie);
  addCheck('02-session-cli-origin-authority');
};

const serializeRawHead = ({ method = 'POST', pathname, headers }) => [
  `${method} ${pathname} HTTP/1.1`,
  ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
  '',
  '',
].join('\r\n');

const openRawConnection = (port) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  const chunks = [];
  let socketError = null;
  let connected = false;
  let connectSettled = false;
  let closeResolve;
  const closed = new Promise((resolveClose) => {
    closeResolve = resolveClose;
  });
  let state;
  const failConnect = (error) => {
    if (connectSettled) return;
    connectSettled = true;
    clearTimeout(timeout);
    if (state) rawConnections.delete(state);
    socket.destroy();
    reject(error);
  };
  const timeout = setTimeout(
    () => failConnect(new Error('raw socket connect timed out')),
    REQUEST_TIMEOUT_MS,
  );
  timeout.unref();
  state = {
    socket,
    write: (data) => socket.write(data),
    end: (data) => socket.end(data),
    destroy: () => socket.destroy(),
    getBuffer: () => Buffer.concat(chunks),
    getError: () => socketError,
    waitClosed: async (timeoutMs = REQUEST_TIMEOUT_MS) => {
      let deadline;
      try {
        await Promise.race([
          closed,
          new Promise((_, rejectDeadline) => {
            deadline = setTimeout(() => rejectDeadline(new Error('raw socket close timed out')), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(deadline);
      }
    },
  };
  rawConnections.add(state);
  socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  socket.on('error', (error) => {
    socketError = error;
    if (!connected) failConnect(error);
  });
  socket.once('close', () => {
    clearTimeout(timeout);
    rawConnections.delete(state);
    closeResolve();
    if (!connected) failConnect(socketError ?? new Error('raw socket closed before connect'));
  });
  socket.once('connect', () => {
    connected = true;
    connectSettled = true;
    clearTimeout(timeout);
    resolve(state);
  });
});

const rawResponses = (connection, connectionClosed = true) =>
  parseRawHttpResponses(connection.getBuffer(), { connectionClosed });

const openPartialUpload = async ({
  port,
  cliToken,
  declaredBytes,
  initialBytes = 1,
  filename = 'partial.bin',
}) => {
  const connection = await openRawConnection(port);
  const headers = buildUploadHeaders({
    port,
    credential: { kind: 'cli', token: cliToken },
    contentLength: declaredBytes,
    contentType: 'application/octet-stream',
    filename,
  });
  connection.write(serializeRawHead({ pathname: '/api/upload-file', headers }));
  if (initialBytes > 0) connection.write(Buffer.alloc(initialBytes, 0x70));
  return connection;
};

const runRawIngressMatrix = async ({ cookie, cliToken }) => {
  const port = serverState.port;
  const unauth = await openRawConnection(port);
  unauth.write(serializeRawHead({
    pathname: '/api/upload-file',
    headers: buildUploadHeaders({
      port,
      credential: null,
      contentLength: 1,
      origin: `http://127.0.0.1:${port}`,
      expect: '100-continue',
    }),
  }));
  await unauth.waitClosed();
  assert(rawResponses(unauth).map((item) => item.statusCode).join(',') === '401', 'unauth Expect sent interim 100');

  const authorized = await openRawConnection(port);
  authorized.write(serializeRawHead({
    pathname: '/api/upload-file',
    headers: buildUploadHeaders({
      port,
      credential: { kind: 'cli', token: cliToken },
      contentLength: 1,
      expect: '100-continue',
      filename: 'expect.bin',
    }),
  }));
  await waitFor('authorized interim 100', () =>
    rawResponses(authorized, false).some((item) => item.statusCode === 100), 5_000);
  authorized.write(Buffer.from('E'));
  await authorized.waitClosed();
  assert(
    rawResponses(authorized).map((item) => item.statusCode).join(',') === '100,200',
    'authorized Expect response sequence mismatch',
  );

  const unsupported = await openRawConnection(port);
  unsupported.write(serializeRawHead({
    pathname: '/api/upload-file',
    headers: buildUploadHeaders({
      port,
      credential: { kind: 'cli', token: cliToken },
      contentLength: 1,
      expect: 'fancy-expectation',
    }),
  }));
  await unsupported.waitClosed();
  assert(rawResponses(unsupported).map((item) => item.statusCode).join(',') === '417', 'unsupported Expect was not 417');

  const ambiguous = await openRawConnection(port);
  const ambiguousHeaders = buildUploadHeaders({
    port,
    credential: { kind: 'cli', token: cliToken },
    contentLength: 1,
  });
  ambiguousHeaders['Transfer-Encoding'] = 'chunked';
  ambiguous.end(`${serializeRawHead({ pathname: '/api/upload-file', headers: ambiguousHeaders })}0\r\n\r\n`);
  await ambiguous.waitClosed();
  assert(rawResponses(ambiguous)[0]?.statusCode === 400, 'CL+TE did not receive parser 400');

  await cleanupUploads(port, cookie);
  const short = await openRawConnection(port);
  short.end(`${serializeRawHead({
    pathname: '/api/upload-file',
    headers: buildUploadHeaders({
      port,
      credential: { kind: 'cli', token: cliToken },
      contentLength: 2,
      filename: 'short.bin',
    }),
  })}S`);
  await short.waitClosed();
  assert(!rawResponses(short).some((item) => item.statusCode === 200), 'short body returned 200');
  await waitForNoArtifacts('short body cleanup');

  const extra = await openRawConnection(port);
  const extraHead = serializeRawHead({
    pathname: '/api/upload-file',
    headers: buildUploadHeaders({
      port,
      credential: { kind: 'cli', token: cliToken },
      contentLength: 1,
      filename: 'extra.bin',
      connection: 'keep-alive',
    }),
  });
  const second = serializeRawHead({
    method: 'GET',
    pathname: '/api/config',
    headers: {
      Host: `127.0.0.1:${port}`,
      Cookie: cookie,
      Connection: 'close',
    },
  });
  extra.write(`${extraHead}A${second}`);
  await extra.waitClosed();
  const extraResponses = rawResponses(extra);
  assert(extraResponses.filter((item) => item.statusCode >= 200).length === 1, 'extra octets reached a second handler');
  assert(extraResponses.at(-1)?.statusCode === 200, 'extra-octet upload did not flush 200');
  const scan = await scanUploadArtifacts(home);
  assert(scan.committed.length === 1 && scan.committed[0].size === 1, 'extra-octet artifact mismatch');
  await cleanupUploads(port, cookie);
  addCheck('03-raw-expect-framing-extra-octet');
};

const addBrowserCookie = async (context, baseUrl, cookie) => {
  const separator = cookie.indexOf('=');
  await context.addCookies([{
    name: cookie.slice(0, separator),
    value: cookie.slice(separator + 1),
    url: baseUrl,
  }]);
};

const browserFileUpload = async ({ cookie, pathname, bytes, type, name, fill }) => {
  browser ??= await chromium.launch({ headless: true });
  const baseUrl = `http://127.0.0.1:${serverState.port}`;
  const context = await browser.newContext();
  await addBrowserCookie(context, baseUrl, cookie);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/api/health`, {
      waitUntil: 'domcontentloaded',
      timeout: REQUEST_TIMEOUT_MS,
    });
    return await page.evaluate(async (input) => {
      const chunkBytes = 64 * 1024;
      const chunk = new Uint8Array(chunkBytes);
      chunk.fill(input.fill);
      const parts = [];
      let remaining = input.bytes;
      while (remaining >= chunkBytes) {
        parts.push(chunk);
        remaining -= chunkBytes;
      }
      if (remaining > 0) parts.push(chunk.subarray(0, remaining));
      const file = new File(parts, input.name, { type: input.type });
      const response = await fetch(input.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': input.type,
          'X-Cmux-Filename': encodeURIComponent(input.name),
          'X-Cmux-Ws-Id': 'browser-ws',
          'X-Cmux-Tab-Id': 'browser-tab',
        },
        body: file,
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
      return { status: response.status, body };
    }, { pathname, bytes, type, name, fill });
  } finally {
    await context.close();
  }
};

const runChromiumBoundaries = async ({ cookie }) => {
  const exactImage = await browserFileUpload({
    cookie,
    pathname: '/api/upload-image',
    bytes: IMAGE_LIMIT,
    type: 'image/png',
    name: 'exact-image.png',
    fill: 0x49,
  });
  assert(exactImage.status === 200, `Chromium exact image failed: ${exactImage.status}`);
  await assertStoredArtifact(exactImage.body, IMAGE_LIMIT, 'Chromium exact image');

  const exactFile = await browserFileUpload({
    cookie,
    pathname: '/api/upload-file',
    bytes: FILE_LIMIT,
    type: 'application/octet-stream',
    name: 'exact-file.bin',
    fill: 0x46,
  });
  assert(exactFile.status === 200, `Chromium exact file failed: ${exactFile.status}`);
  await assertStoredArtifact(exactFile.body, FILE_LIMIT, 'Chromium exact file');
  addCheck('04-chromium-exact-boundaries');
  await cleanupUploads(serverState.port, cookie);

  const oversizedImage = await browserFileUpload({
    cookie,
    pathname: '/api/upload-image',
    bytes: IMAGE_LIMIT + 1,
    type: 'image/png',
    name: 'oversized-image.png',
    fill: 0x69,
  });
  assert(
    oversizedImage.status === 413 && oversizedImage.body.code === 'payload-too-large',
    `Chromium oversized image mismatch: ${JSON.stringify(oversizedImage)}`,
  );
  const oversizedFile = await browserFileUpload({
    cookie,
    pathname: '/api/upload-file',
    bytes: FILE_LIMIT + 1,
    type: 'application/octet-stream',
    name: 'oversized-file.bin',
    fill: 0x66,
  });
  assert(
    oversizedFile.status === 413 && oversizedFile.body.code === 'payload-too-large',
    `Chromium oversized file mismatch: ${JSON.stringify(oversizedFile)}`,
  );
  await waitForNoArtifacts('Chromium oversized cleanup');
  addCheck('05-chromium-limit-plus-one');
};

const streamFixtureUpload = async ({ fixturePath, bytes, cliToken, name }) => {
  const headers = buildUploadHeaders({
    port: serverState.port,
    credential: { kind: 'cli', token: cliToken },
    contentLength: bytes,
    contentType: 'application/octet-stream',
    filename: name,
    workspaceId: 'hash-ws',
    tabId: 'hash-tab',
  });
  return request({
    port: serverState.port,
    pathname: '/api/upload-file',
    method: 'POST',
    headers,
    body: createReadStream(fixturePath, { start: 0, end: bytes - 1 }),
    timeoutMs: LARGE_REQUEST_TIMEOUT_MS,
  });
};

const runHashParity = async ({ cookie, cliToken }) => {
  const fixturePath = path.join(home, 'fixtures', 'repeated-37mib.bin');
  await writeRepeatedFile(fixturePath, { bytes: 37 * MIB, fill: 0x37 });
  for (const bytes of [11 * MIB, 37 * MIB]) {
    const response = await streamFixtureUpload({
      fixturePath,
      bytes,
      cliToken,
      name: `parity-${bytes / MIB}mib.bin`,
    });
    assert(response.status === 200, `${bytes / MIB}MiB parity upload failed: ${response.status} ${response.text}`);
    const storedPath = await assertStoredArtifact(parseJson(response, 'parity upload'), bytes, 'parity upload');
    const expected = sha256Repeated({ bytes, fill: 0x37 });
    assert(await sha256File(storedPath) === expected, `${bytes / MIB}MiB stored SHA-256 mismatch`);
  }
  await cleanupUploads(serverState.port, cookie);
  addCheck('06-streamed-11mib-37mib-hash-parity');
};

const runCapacityTimeoutAbort = async ({ cookie, cliToken }) => {
  const partials = [];
  try {
    for (let index = 0; index < 8; index += 1) {
      partials.push(await openPartialUpload({
        port: serverState.port,
        cliToken,
        declaredBytes: MIB,
        filename: `capacity-${index}.bin`,
      }));
      await waitFor(`capacity stage ${index + 1}`, async () => {
        const scan = await scanUploadArtifacts(home);
        return scan.staged.length === index + 1;
      }, 10_000);
    }
    const startedAt = Date.now();
    const overflow = await uploadBuffer({
      port: serverState.port,
      credential: { kind: 'cli', token: cliToken },
      origin: null,
      filename: 'capacity-overflow.bin',
    });
    assert(overflow.status === 429, `capacity overflow expected 429, got ${overflow.status}`);
    assert(overflow.headers['retry-after'] === '1', 'capacity overflow Retry-After mismatch');
    assert(Date.now() - startedAt < 3_000, 'capacity overflow was not immediate');
  } finally {
    for (const partial of partials) partial.destroy();
  }
  await waitForNoArtifacts('capacity abort cleanup');

  const idle = await openPartialUpload({
    port: serverState.port,
    cliToken,
    declaredBytes: 2,
    filename: 'idle-timeout.bin',
  });
  await waitFor('idle timeout stage', async () => (await scanUploadArtifacts(home)).staged.length === 1);
  await idle.waitClosed(IDLE_TIMEOUT_DEADLINE_MS);
  assert(rawResponses(idle).some((item) => item.statusCode === 408), 'idle upload did not return 408');
  await waitForNoArtifacts('idle timeout cleanup');

  const aborted = await openPartialUpload({
    port: serverState.port,
    cliToken,
    declaredBytes: MIB,
    initialBytes: 64 * 1024,
    filename: 'aborted.bin',
  });
  await waitFor('aborted upload stage', async () => (await scanUploadArtifacts(home)).staged.length === 1);
  aborted.destroy();
  await waitForNoArtifacts('aborted upload cleanup');
  addCheck('07-capacity-idle-timeout-abort-cleanup');

  const active = await openPartialUpload({
    port: serverState.port,
    cliToken,
    declaredBytes: MIB,
    initialBytes: 64 * 1024,
    filename: 'manual-cleanup-active.bin',
  });
  await waitFor('manual cleanup active stage', async () => (await scanUploadArtifacts(home)).staged.length === 1);
  const cleanup = await jsonRequest({
    port: serverState.port,
    pathname: '/api/uploads/cleanup',
    method: 'POST',
    cookie,
    body: { mode: 'all' },
  });
  assert(cleanup.status === 200, `manual cleanup during upload failed: ${cleanup.status}`);
  const during = await scanUploadArtifacts(home);
  assert(during.staged.length === 1 && during.committed.length === 0, 'manual cleanup removed active stage');
  active.destroy();
  await waitForNoArtifacts('manual cleanup active abort');
  addCheck('08-manual-cleanup-preserves-active-stage');
};

const runProtectedAndManifestChecks = async ({ cookie, cliToken }) => {
  const port = serverState.port;
  const unauth = await request({ port, pathname: '/api/config' });
  assert(unauth.status === 401, `protected config unauth expected 401, got ${unauth.status}`);
  const session = await request({
    port,
    pathname: '/api/config',
    headers: { Host: `127.0.0.1:${port}`, Cookie: cookie, Connection: 'close' },
  });
  assert(session.status === 200, `protected config session failed: ${session.status}`);
  const cli = await request({
    port,
    pathname: '/api/config',
    headers: { Host: `127.0.0.1:${port}`, 'X-Cmux-Token': cliToken, Connection: 'close' },
  });
  assert(cli.status === 200, `protected config CLI failed: ${cli.status}`);
  addCheck('09-protected-next-fallback');

  for (const routeFile of ['src/pages/api/upload-image.ts', 'src/pages/api/upload-file.ts']) {
    assert(!(await pathExists(path.join(rootDir, routeFile))), `${routeFile} still exists`);
  }
  if (MODE === 'production') {
    const buildId = await readBuildId(rootDir);
    assert(buildId.length > 0, 'production build id missing');
    const manifest = JSON.parse(await fs.readFile(
      path.join(rootDir, '.next', 'server', 'pages-manifest.json'),
      'utf8',
    ));
    assert(!('/api/upload-image' in manifest), 'production manifest contains upload-image');
    assert(!('/api/upload-file' in manifest), 'production manifest contains upload-file');
    assert('/api/uploads/cleanup' in manifest, 'production manifest lost uploads cleanup');
  }
  addCheck('10-pages-upload-routes-absent');
};

const newestMtime = async (target) => {
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  const entries = await fs.readdir(target, { withFileTypes: true });
  const mtimes = await Promise.all(entries.map((entry) => newestMtime(path.join(target, entry.name))));
  return Math.max(stat.mtimeMs, ...mtimes);
};

const verifyFreshProductionBuild = async () => {
  const sourceMtime = Math.max(...await Promise.all([
    path.join(rootDir, 'server.ts'),
    path.join(rootDir, 'src'),
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'next.config.ts'),
    path.join(rootDir, 'tsup.config.ts'),
  ].map(newestMtime)));
  const artifacts = [
    path.join(rootDir, '.next', 'BUILD_ID'),
    path.join(rootDir, '.next', 'server', 'pages-manifest.json'),
    path.join(rootDir, '.next', 'standalone', 'server.js'),
    path.join(rootDir, 'dist', 'server.js'),
  ];
  const artifactStats = await Promise.all(artifacts.map((artifact) => fs.stat(artifact)));
  assert(
    artifactStats.every((stat) => stat.mtimeMs >= sourceMtime),
    'production artifacts are stale; run corepack pnpm build',
  );
};

const runShutdownAndKillSwitch = async ({ cliToken }) => {
  const active = await openPartialUpload({
    port: serverState.port,
    cliToken,
    declaredBytes: MIB,
    initialBytes: 64 * 1024,
    filename: 'shutdown-active.bin',
  });
  await waitFor('shutdown active stage', async () => (await scanUploadArtifacts(home)).staged.length === 1);
  await stopServer(serverState);
  serverState = null;
  active.destroy();
  await waitForNoArtifacts('shutdown active cleanup');

  const disabled = await startServer({ extra: { CODEXMUX_UPLOADS_DISABLED: '1' } });
  serverState = disabled;
  const configured = await login(disabled.port, PASSWORD);
  assert(configured.response.status === 200 && configured.cookie, 'kill-switch login failed');
  for (const [pathname, contentType] of [
    ['/api/upload-image', 'image/png'],
    ['/api/upload-file', 'application/octet-stream'],
  ]) {
    const response = await uploadBuffer({
      port: disabled.port,
      pathname,
      credential: { kind: 'session', cookie: configured.cookie },
      contentType,
      filename: pathname.endsWith('image') ? 'disabled.png' : 'disabled.bin',
    });
    const body = parseJson(response, 'kill-switch upload');
    assert(response.status === 503 && body.code === 'uploads-disabled', `${pathname} kill switch mismatch`);
  }
  const health = await request({ port: disabled.port, pathname: '/api/health' });
  assert(health.status === 200, `kill-switch health failed: ${health.status}`);
  const config = await request({
    port: disabled.port,
    pathname: '/api/config',
    headers: {
      Host: `127.0.0.1:${disabled.port}`,
      Cookie: configured.cookie,
      Connection: 'close',
    },
  });
  assert(config.status === 200, `kill-switch protected config failed: ${config.status}`);
  await waitForNoArtifacts('kill-switch artifacts');
  await stopServer(disabled);
  serverState = null;
};

const run = async () => {
  if (MODE !== 'development' && MODE !== 'production') {
    throw new Error('CODEXMUX_UPLOAD_SMOKE_MODE must be development or production');
  }
  if (MODE === 'production') await verifyFreshProductionBuild();
  home = await createIsolatedHome();
  const credentials = await setupFreshHome();
  await runAuthorityMatrix(credentials);
  await runRawIngressMatrix(credentials);
  await runChromiumBoundaries(credentials);
  await runHashParity(credentials);
  await runCapacityTimeoutAbort(credentials);
  await runProtectedAndManifestChecks(credentials);
  await runShutdownAndKillSwitch(credentials);
  assert(
    processStates.every((state) => !state.hasBodyWarning()),
    'Next Request body exceeded 10MB warning appeared for an outer-owned upload',
  );
  addCheck('11-no-next-large-body-warning');
  addCheck('12-kill-switch-and-shutdown-cleanup');
  assert(checks.length === 12, `expected 12 smoke checks, got ${checks.length}`);
  console.log(JSON.stringify({ ok: true, mode: MODE, checks }, null, 2));
};

try {
  await run();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    mode: MODE,
    message: error instanceof Error ? error.message : String(error),
    checks,
    output: processStates.at(-1)?.getOutput().slice(-4_000) ?? '',
  }, null, 2));
  process.exitCode = 1;
} finally {
  for (const connection of [...rawConnections]) connection.destroy();
  if (browser) await browser.close().catch(() => undefined);
  if (serverState) await stopServer(serverState).catch(() => undefined);
  if (home && process.env.CODEXMUX_UPLOAD_SMOKE_KEEP !== '1') {
    await fs.rm(home, { recursive: true, force: true }).catch(() => undefined);
  }
}
