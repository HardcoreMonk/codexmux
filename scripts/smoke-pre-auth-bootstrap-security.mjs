#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs/promises';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const MODE = process.env.CODEXMUX_PREAUTH_SMOKE_MODE;
const TIMEOUT_MS = 45_000;
const PASSWORD = 'preauth-smoke-password';
const INIT_PASSWORD = 'preauth-smoke-init';
const STALE_PASSWORD = 'preauth-smoke-stale';
const rootDir = process.cwd();
const checks = [];
const tempHomes = [];
const children = new Set();

if (MODE !== 'development' && MODE !== 'production') {
  throw new Error('CODEXMUX_PREAUTH_SMOKE_MODE must be development or production');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (label, callback, timeoutMs = TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`${label} timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
};

const addCheck = (name) => {
  checks.push(name);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const createHome = async (label) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), `codexmux-preauth-${label}-`));
  tempHomes.push(home);
  return home;
};

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(() => resolve(port));
  });
  server.on('error', reject);
});

const canConnect = (host, port, timeoutMs = 1_000) => new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  const done = (value) => {
    socket.destroy();
    resolve(value);
  };
  socket.setTimeout(timeoutMs, () => done(false));
  socket.once('connect', () => done(true));
  socket.once('error', () => done(false));
});

const exchangeRaw = (port, payload, timeoutMs = 3_000) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  const chunks = [];
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    socket.destroy();
    if (error) reject(error);
    else resolve(Buffer.concat(chunks).toString('utf8'));
  };
  const timer = setTimeout(() => finish(new Error('raw exchange timed out')), timeoutMs);
  timer.unref();
  socket.once('connect', () => socket.write(payload));
  socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  socket.once('error', finish);
  socket.once('close', () => finish());
});

const findNonLoopbackIPv4 = () => {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
};

const buildEnv = ({ home, port, extra = {} }) => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key === 'AUTH_PASSWORD'
      || key === 'NEXTAUTH_SECRET'
      || key === 'INIT_PASSWORD'
      || key === '__CMUX_NETWORK_ACCESS'
      || key === '__CMUX_BOUND_HOST'
      || key === '__CMUX_APP_DIR'
      || key === '__CMUX_APP_DIR_UNPACKED'
      || key === '__CMUX_PRISTINE_ENV'
      || key.startsWith('__CMUX_BOOTSTRAP_')
      || key === 'CODEXMUX_RUNTIME_V2'
      || key.startsWith('CODEXMUX_RUNTIME_')
    ) {
      delete env[key];
    }
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    HOST: '0.0.0.0',
    PORT: String(port),
    SHELL: process.env.SHELL || '/bin/bash',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_UPDATE_NOTIFIER: '1',
    ...extra,
  });
  if (MODE === 'development') delete env.NODE_ENV;
  env.__CMUX_PRISTINE_ENV = JSON.stringify(env);
  return env;
};

const spawnServer = ({ home, port, extra = {} }) => {
  const command = MODE === 'development' ? 'corepack' : 'node';
  const args = MODE === 'development'
    ? ['pnpm', 'exec', 'tsx', 'server.ts']
    : ['bin/codexmux.js'];
  const child = spawn(command, args, {
    cwd: rootDir,
    env: buildEnv({ home, port, extra }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.once('exit', () => children.delete(child));
  return { child, getOutput: () => output };
};

const waitForExit = (child, timeoutMs = 15_000) => new Promise((resolve, reject) => {
  if (child.exitCode !== null) {
    resolve(child.exitCode);
    return;
  }
  const timer = setTimeout(() => reject(new Error('child exit timed out')), timeoutMs);
  child.once('exit', (code) => {
    clearTimeout(timer);
    resolve(code);
  });
});

const stopChild = async (child) => {
  if (child.exitCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([
    waitForExit(child, 10_000).catch(() => null),
    sleep(10_000),
  ]);
  if (child.exitCode === null) {
    const exited = waitForExit(child, 5_000).catch(() => null);
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(5_000)]);
  }
  if (child.exitCode === null) {
    const exited = waitForExit(child, 5_000).catch(() => null);
    child.kill('SIGKILL');
    await exited;
  }
};

const request = ({
  port,
  pathname = '/',
  method = 'GET',
  host = `127.0.0.1:${port}`,
  origin,
  cookie,
  contentType,
  body,
  connectHost = '127.0.0.1',
  timeoutMs = 5_000,
  omitHost = false,
}) => new Promise((resolve, reject) => {
  const headers = omitHost ? {} : { Host: host };
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  if (contentType) headers['Content-Type'] = contentType;
  if (body !== undefined) headers['Content-Length'] = Buffer.byteLength(body);
  const req = http.request({
    hostname: connectHost,
    port,
    path: pathname,
    method,
    headers,
    setHost: !omitHost,
    timeout: timeoutMs,
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
    });
  });
  req.on('timeout', () => req.destroy(new Error('request timed out')));
  req.on('error', reject);
  if (body !== undefined) req.write(body);
  req.end();
});

const parseJson = (response) => {
  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error(`expected JSON response, got ${response.status}: ${response.text.slice(0, 300)}`);
  }
};

const jsonRequest = ({ port, pathname, method = 'GET', cookie, body, origin, host }) => request({
  port,
  pathname,
  method,
  cookie,
  host,
  origin: origin ?? (body === undefined ? undefined : `http://127.0.0.1:${port}`),
  contentType: body === undefined ? undefined : 'application/json',
  body: body === undefined ? undefined : JSON.stringify(body),
});

const login = async (port, password) => {
  const response = await jsonRequest({
    port,
    pathname: '/api/auth/login',
    method: 'POST',
    body: { password },
  });
  if (response.status !== 200) return { response, cookie: null };
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return { response, cookie: raw?.split(';', 1)[0] ?? null };
};

const waitForPortFile = async (home, processState) => {
  const portFile = path.join(home, '.codexmux', 'port');
  return waitFor('server port file', async () => {
    if (processState.child.exitCode !== null) {
      throw new Error(`server exited ${processState.child.exitCode}: ${processState.getOutput().slice(-2_000)}`);
    }
    const raw = await fs.readFile(portFile, 'utf8').catch(() => '');
    const port = Number(raw.trim());
    if (!Number.isInteger(port) || port < 1) return null;
    const health = await request({ port, pathname: '/api/health' }).catch(() => null);
    return health?.status === 200 ? port : null;
  });
};

const startServer = async ({ home, port, extra = {} }) => {
  const processState = spawnServer({ home, port, extra });
  const actualPort = await waitForPortFile(home, processState);
  return {
    ...processState,
    port: actualPort,
    stop: () => stopChild(processState.child),
  };
};

const expectStartupFailure = async ({ home, port, extra = {} }) => {
  const processState = spawnServer({ home, port, extra });
  const code = await waitForExit(processState.child);
  assert(code !== 0, `expected startup failure, got exit ${code}`);
  assert(!(await canConnect('127.0.0.1', port)), 'failed startup opened the requested port');
  return processState.getOutput();
};

const installUrl = (port, command = 'git') =>
  `ws://127.0.0.1:${port}/api/install?command=${encodeURIComponent(command)}&cols=80&rows=24`;

const openInstall = ({ port, cookie, origin = `http://127.0.0.1:${port}` }) =>
  new Promise((resolve, reject) => {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    const ws = new WebSocket(installUrl(port), { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('install WebSocket open timed out'));
    }, 10_000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      reject(new Error(`install WebSocket rejected: ${response.statusCode}`));
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

const expectInstallRejected = ({ port, cookie, origin, status }) =>
  new Promise((resolve, reject) => {
    const headers = { Origin: origin ?? `http://127.0.0.1:${port}` };
    if (cookie) headers.Cookie = cookie;
    const ws = new WebSocket(installUrl(port), { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('install rejection timed out'));
    }, 10_000);
    ws.on('error', () => undefined);
    ws.once('open', () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error('install WebSocket unexpectedly opened'));
    });
    ws.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      const actual = response.statusCode ?? 0;
      response.resume();
      if (actual !== status) {
        reject(new Error(`expected install rejection ${status}, got ${actual}`));
        return;
      }
      resolve();
    });
  });

const waitForClose = (ws, timeoutMs = 3_000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    ws.terminate();
    reject(new Error('WebSocket close timed out'));
  }, timeoutMs);
  ws.once('close', (code, reason) => {
    clearTimeout(timer);
    resolve({ code, reason: reason.toString() });
  });
});

const verifyProductionNextSecurityRegressions = async ({ port, cookie }) => {
  const buildId = (await fs.readFile(path.join(rootDir, '.next', 'BUILD_ID'), 'utf8')).trim();
  assert(buildId.length > 0, 'production BUILD_ID is empty');

  const dataRoute = await request({
    port,
    pathname: `/_next/data/${encodeURIComponent(buildId)}/index.json`,
  });
  if (dataRoute.status >= 300 && dataRoute.status < 400) {
    assert(String(dataRoute.headers.location ?? '').includes('/login'), 'data route rejection did not target login');
  } else {
    const data = parseJson(dataRoute);
    const pageProps = data?.pageProps;
    assert(dataRoute.status === 200, `unauthenticated data route returned ${dataRoute.status}`);
    assert(pageProps?.__N_REDIRECT === '/login', 'data route did not encode a login redirect');
    assert(pageProps?.__N_REDIRECT_STATUS === 307, 'data route login redirect status mismatch');
    assert(
      Object.keys(pageProps).every((key) => key === '__N_REDIRECT' || key === '__N_REDIRECT_STATUS'),
      'data route exposed protected page props',
    );
  }
  addCheck('next-data-route-auth');

  const dynamicRoute = await request({
    port,
    pathname: '/api/layout/pane/visible-pane/tabs/visible-tab?nxtPpaneId=attacker-pane&nxtPtabId=attacker-tab',
  });
  assert(dynamicRoute.status === 401, `dynamic route parameter injection expected 401, got ${dynamicRoute.status}`);
  addCheck('next-dynamic-route-parameter-auth');

  const attackerPort = await getFreePort();
  let attackerConnections = 0;
  const attacker = net.createServer((socket) => {
    attackerConnections += 1;
    socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  await new Promise((resolve, reject) => {
    attacker.once('error', reject);
    attacker.listen(attackerPort, '127.0.0.1', resolve);
  });
  try {
    const response = await exchangeRaw(port, [
      `GET http://127.0.0.1:${attackerPort}/attacker-selected HTTP/1.1`,
      `Host: 127.0.0.1:${port}`,
      'Connection: Upgrade',
      'Upgrade: websocket',
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: Y29kZXhtdXgtc21va2U=',
      `Cookie: ${cookie}`,
      '',
      '',
    ].join('\r\n'));
    assert(!response.includes('101 Switching Protocols'), 'unknown WebSocket upgrade unexpectedly succeeded');
    assert(attackerConnections === 0, 'unknown WebSocket upgrade reached attacker destination');
    addCheck('next-websocket-ssrf-rejected');
  } finally {
    await new Promise((resolve) => attacker.close(() => resolve()));
  }
};

const setupPayload = {
  authPassword: PASSWORD,
  locale: 'ko',
  appTheme: 'dark',
  dangerouslySkipPermissions: false,
  networkAccess: 'localhost',
};

const runPrimaryFlow = async () => {
  const home = await createHome('primary');
  const requestedPort = await getFreePort();
  const root = process.getuid?.() === 0;

  if (root) {
    await expectStartupFailure({ home, port: requestedPort });
    addCheck('elevated-setup-open-refused');
  }

  const server = await startServer({
    home,
    port: requestedPort,
    extra: root ? { INIT_PASSWORD } : {},
  });
  try {
    assert(server.port === requestedPort, 'primary server unexpectedly changed ports');
    await waitFor('security startup log', () => (
      server.getOutput().includes('Security:')
      && server.getOutput().includes('setup mode, loopback-only')
      && server.getOutput().includes('Deferred:')
      && server.getOutput().includes('HOST=0.0.0.0')
    ));
    addCheck('setup-loopback-log');

    const interfaceIp = findNonLoopbackIPv4();
    if (interfaceIp) {
      assert(!(await canConnect(interfaceIp, server.port)), 'setup listener accepted non-loopback connection');
      addCheck('setup-non-loopback-connect-refused');
    } else {
      addCheck('setup-non-loopback-interface-unavailable');
    }

    const publicHost = await request({
      port: server.port,
      pathname: '/api/health',
      host: `public.example:${server.port}`,
    });
    assert(publicHost.status === 403, `public Host expected 403, got ${publicHost.status}`);
    const missingHost = await request({
      port: server.port,
      pathname: '/api/health',
      omitHost: true,
    });
    assert(missingHost.status === 400, `missing Host expected 400, got ${missingHost.status}`);
    addCheck('setup-public-host-rejected');

    const configPath = path.join(home, '.codexmux', 'config.json');
    const pristineConfig = await fs.readFile(configPath);
    const form = await request({
      port: server.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      origin: `http://127.0.0.1:${server.port}`,
      contentType: 'application/x-www-form-urlencoded',
      body: 'authPassword=attacker',
    });
    assert(form.status === 415, `form setup expected 415, got ${form.status}`);
    assert((await fs.readFile(configPath)).equals(pristineConfig), 'form setup changed config');

    const missingOrigin = await request({
      port: server.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify(setupPayload),
    });
    assert(missingOrigin.status === 403, `missing Origin expected 403, got ${missingOrigin.status}`);
    assert((await fs.readFile(configPath)).equals(pristineConfig), 'missing Origin changed config');

    const attacker = await jsonRequest({
      port: server.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      origin: 'http://attacker.invalid',
      body: setupPayload,
    });
    assert(attacker.status === 403, `attacker Origin expected 403, got ${attacker.status}`);
    assert((await fs.readFile(configPath)).equals(pristineConfig), 'attacker Origin changed config');
    addCheck('setup-csrf-content-type-rejected');

    await expectInstallRejected({
      port: server.port,
      origin: 'http://attacker.invalid',
      status: 403,
    });
    addCheck('install-attacker-origin-rejected');

    let setupCookie = null;
    if (root) {
      const setupState = parseJson(await jsonRequest({ port: server.port, pathname: '/api/auth/setup' }));
      assert(setupState.requiresAuth === true, 'INIT setup did not advertise session requirement');
      const deniedSetup = await jsonRequest({
        port: server.port,
        pathname: '/api/auth/setup',
        method: 'POST',
        body: setupPayload,
      });
      assert(deniedSetup.status === 401, `INIT setup expected 401, got ${deniedSetup.status}`);
      const initLogin = await login(server.port, INIT_PASSWORD);
      assert(initLogin.response.status === 200 && initLogin.cookie, 'INIT login failed');
      setupCookie = initLogin.cookie;
    }

    const oversized = await openInstall({ port: server.port, cookie: setupCookie });
    const oversizedClose = waitForClose(oversized);
    oversized.send(Buffer.alloc(65_537, 0x78));
    const oversizedResult = await oversizedClose;
    assert(oversizedResult.code === 1009, `oversized install expected 1009, got ${oversizedResult.code}`);

    const afterOversized = await openInstall({ port: server.port, cookie: setupCookie });
    const afterOversizedClose = waitForClose(afterOversized);
    afterOversized.close();
    await afterOversizedClose;
    addCheck('install-frame-limit-slot-recovery');

    const leaseSocket = await openInstall({ port: server.port, cookie: setupCookie });
    const leaseClosed = waitForClose(leaseSocket, 2_000);
    const claimStartedAt = Date.now();
    const setup = await jsonRequest({
      port: server.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      cookie: setupCookie,
      body: setupPayload,
    });
    assert(setup.status === 200, `valid setup failed: ${setup.status} ${setup.text}`);
    const leaseResult = await leaseClosed;
    assert(leaseResult.code === 1000, `setup completion expected install close 1000, got ${leaseResult.code}`);
    assert(Date.now() - claimStartedAt <= 1_000, 'setup install lease did not close within one second');
    addCheck('setup-claim-revokes-install-lease');

    const configuredLogin = await login(server.port, PASSWORD);
    assert(configuredLogin.response.status === 200 && configuredLogin.cookie, 'post-setup login failed');
    addCheck('setup-same-authority-claim');
  } finally {
    await server.stop();
  }

  const restartPort = await getFreePort();
  const configured = await startServer({ home, port: restartPort });
  try {
    const configuredLogin = await login(configured.port, PASSWORD);
    assert(configuredLogin.response.status === 200 && configuredLogin.cookie, 'configured restart login failed');
    if (MODE === 'production') {
      await verifyProductionNextSecurityRegressions({
        port: configured.port,
        cookie: configuredLogin.cookie,
      });
    }
    await expectInstallRejected({ port: configured.port, status: 401 });
    const authenticatedInstall = await openInstall({
      port: configured.port,
      cookie: configuredLogin.cookie,
    });
    const close = waitForClose(authenticatedInstall);
    authenticatedInstall.close();
    await close;
    addCheck('configured-install-session-required');

    const interfaceIp = findNonLoopbackIPv4();
    if (interfaceIp) {
      const health = await request({
        port: configured.port,
        pathname: '/api/health',
        connectHost: interfaceIp,
        host: `${interfaceIp}:${configured.port}`,
      }).catch(() => null);
      assert(health?.status === 200, 'deferred HOST did not apply after configured restart');
      addCheck('configured-deferred-host-applied');
    }
  } finally {
    await configured.stop();
  }
};

const runInitFlow = async () => {
  const home = await createHome('init');
  const port = await getFreePort();
  const server = await startServer({ home, port, extra: { INIT_PASSWORD } });
  try {
    const state = parseJson(await jsonRequest({ port: server.port, pathname: '/api/auth/setup' }));
    assert(state.needsSetup === true && state.requiresAuth === true, 'INIT setup state mismatch');

    await expectInstallRejected({ port: server.port, status: 401 });
    const denied = await jsonRequest({
      port: server.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      body: setupPayload,
    });
    assert(denied.status === 401, `unauthenticated INIT setup expected 401, got ${denied.status}`);

    const initLogin = await login(server.port, INIT_PASSWORD);
    assert(initLogin.response.status === 200 && initLogin.cookie, 'INIT login failed');
    const install = await openInstall({ port: server.port, cookie: initLogin.cookie });
    const installClosed = waitForClose(install, 2_000);
    const claimStartedAt = Date.now();
    const claimed = await jsonRequest({
      port: server.port,
      pathname: '/api/auth/setup',
      method: 'POST',
      cookie: initLogin.cookie,
      body: setupPayload,
    });
    assert(claimed.status === 200, `authenticated INIT setup failed: ${claimed.status}`);
    assert((await installClosed).code === 1000, 'INIT setup did not revoke install lease');
    assert(Date.now() - claimStartedAt <= 1_000, 'INIT install lease did not close within one second');
    addCheck('init-session-setup-install');
  } finally {
    await server.stop();
  }
};

const validScryptHash = (password) => {
  const salt = Buffer.alloc(16, 0x31);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
};

const runInvalidConfigFlows = async () => {
  for (const [label, content] of [
    ['malformed', Buffer.from('{invalid-json\n')],
    ['hash-only', Buffer.from(JSON.stringify({
      authPassword: validScryptHash(PASSWORD),
      updatedAt: '2026-07-11T00:00:00.000Z',
    }, null, 2))],
  ]) {
    const home = await createHome(label);
    const configDir = path.join(home, '.codexmux');
    await fs.mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    await fs.writeFile(configPath, content);
    const port = await getFreePort();

    await expectStartupFailure({ home, port });

    assert((await fs.readFile(configPath)).equals(content), `${label} config bytes changed`);
    addCheck(`${label}-config-fail-closed`);
  }
};

const runStaleEnvFlow = async () => {
  const home = await createHome('stale-env');
  const port = await getFreePort();
  const server = await startServer({
    home,
    port,
    extra: {
      AUTH_PASSWORD: validScryptHash(STALE_PASSWORD),
      NEXTAUTH_SECRET: 'stale-secret-that-must-not-survive',
      __CMUX_BOOTSTRAP_STARTED_IN_SETUP: '0',
      __CMUX_BOOTSTRAP_CLAIM_PENDING: '0',
      __CMUX_BOOTSTRAP_INIT_SESSION_REQUIRED: '1',
      ...(process.getuid?.() === 0 ? { INIT_PASSWORD } : {}),
    },
  });
  try {
    const state = parseJson(await jsonRequest({ port: server.port, pathname: '/api/auth/setup' }));
    assert(
      state.needsSetup === true
      && state.requiresAuth === (process.getuid?.() === 0),
      'stale bootstrap env survived startup',
    );
    const staleLogin = await login(server.port, STALE_PASSWORD);
    assert(staleLogin.response.status === 401, 'stale runtime credentials authenticated');
    addCheck('stale-runtime-env-scrubbed');
  } finally {
    await server.stop();
  }
};

const newestMtime = async (target) => {
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  const entries = await fs.readdir(target, { withFileTypes: true });
  const mtimes = await Promise.all(entries.map((entry) =>
    newestMtime(path.join(target, entry.name))));
  return Math.max(stat.mtimeMs, ...mtimes);
};

const verifyProductionArtifactsAreFresh = async () => {
  const sourceMtime = Math.max(...await Promise.all([
    path.join(rootDir, 'server.ts'),
    path.join(rootDir, 'src'),
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'next.config.ts'),
    path.join(rootDir, 'tsup.config.ts'),
  ].map(newestMtime)));
  const artifactMtimes = await Promise.all([
    path.join(rootDir, 'dist', 'server.js'),
    path.join(rootDir, '.next', 'standalone', 'server.js'),
  ].map(async (artifact) => (await fs.stat(artifact)).mtimeMs));
  assert(
    artifactMtimes.every((mtime) => mtime >= sourceMtime),
    'production artifacts are older than the current source; run corepack pnpm build',
  );
  addCheck('production-artifacts-fresh');
};

const runFallbackFlow = async () => {
  const home = await createHome('fallback');
  const requestedPort = await getFreePort();
  const dummySockets = new Set();
  const dummy = net.createServer((socket) => {
    dummySockets.add(socket);
    socket.once('close', () => dummySockets.delete(socket));
    socket.end('HTTP/1.1 418 I am a teapot\r\nContent-Length: 5\r\n\r\ndummy');
  });
  await new Promise((resolve, reject) => {
    dummy.listen(requestedPort, '127.0.0.1', resolve);
    dummy.on('error', reject);
  });
  let server;
  try {
    server = await startServer({
      home,
      port: requestedPort,
      extra: process.getuid?.() === 0 ? { INIT_PASSWORD } : {},
    });
    assert(server.port !== requestedPort, 'fallback reused the occupied requested port');
    const actualHealth = await request({ port: server.port, pathname: '/api/health' });
    const dummyHealth = await request({ port: requestedPort, pathname: '/api/health' });
    assert(actualHealth.status === 200, 'actual fallback listener health failed');
    assert(dummyHealth.status === 418, 'requested-port dummy was not preserved');
    addCheck('occupied-port-file-fallback');
  } finally {
    if (server) await server.stop();
    for (const socket of dummySockets) socket.destroy();
    if (dummy.listening) {
      await new Promise((resolve) => dummy.close(() => resolve()));
    }
  }
};

const cleanup = async () => {
  await Promise.all([...children].map((child) => stopChild(child)));
  if (process.env.CODEXMUX_PREAUTH_SMOKE_KEEP === '1') return;
  await Promise.all(tempHomes.map((home) => fs.rm(home, { recursive: true, force: true })));
};

try {
  if (MODE === 'production') {
    await verifyProductionArtifactsAreFresh();
  }
  await runPrimaryFlow();
  await runInitFlow();
  await runInvalidConfigFlows();
  await runStaleEnvFlow();
  await runFallbackFlow();
  console.log(JSON.stringify({ ok: true, mode: MODE, checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    mode: MODE,
    message: error instanceof Error ? error.message : String(error),
    checks,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await cleanup();
}
