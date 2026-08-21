#!/usr/bin/env node
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const rootDir = process.cwd();
const timeoutMs = Number(process.env.CODEXMUX_SESSION_GOVERNANCE_BROWSER_TIMEOUT_MS || 45_000);
const password = 'session-governance-browser-smoke';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(() => resolve(port));
  });
  server.on('error', reject);
});

const waitFor = async (label, operation) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`${label} timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
};

const requestJson = async (baseUrl, pathname, { token, cookie, ...init } = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      ...(token ? { 'x-cmux-token': token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.body ? { 'Content-Type': 'application/json', Origin: new URL(baseUrl).origin } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} failed with ${response.status}`);
  return { payload, response };
};

const startServer = async (homeDir, port) => {
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    SHELL: '/bin/sh',
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
    CODEXMUX_RUNTIME_V2: '1',
    CODEXMUX_SESSION_CATALOG_MODE: 'default',
    CODEXMUX_RUNTIME_DB: path.join(homeDir, 'runtime-v2', 'state.db'),
  };
  delete env.__CMUX_PRISTINE_ENV;
  env.__CMUX_PRISTINE_ENV = JSON.stringify(env);
  const child = spawn('corepack', ['pnpm', 'exec', 'tsx', 'server.ts'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitFor('browser server startup', async () => {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    return fetch(new URL('/api/health', baseUrl)).then((response) => response.ok).catch(() => false);
  });
  return {
    child,
    baseUrl,
    output: () => output,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGINT');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        sleep(10_000).then(() => child.exitCode === null && child.kill('SIGTERM')),
      ]);
    },
  };
};

const prepareFixture = async (homeDir) => {
  const projectRoot = path.join(homeDir, 'projects');
  const projectPath = path.join(projectRoot, 'demo');
  const sessionsRoot = path.join(homeDir, '.codex', 'sessions');
  await Promise.all([
    fs.mkdir(path.join(projectPath, 'docs', 'superpowers', 'specs'), { recursive: true }),
    fs.mkdir(sessionsRoot, { recursive: true }),
  ]);
  await fs.writeFile(path.join(projectPath, 'AGENTS.md'), '# Guidance\n');
  await fs.writeFile(path.join(projectPath, 'docs', 'superpowers', 'specs', 'feature.md'), '# Feature\n');
  await fs.writeFile(path.join(sessionsRoot, 'browser-smoke-session.jsonl'), [
    JSON.stringify({
      type: 'session_meta', timestamp: '2026-08-21T10:00:00.000Z',
      payload: { id: 'browser-smoke-session', cwd: projectPath, model: 'gpt-5.6' },
    }),
    JSON.stringify({
      type: 'response_item', timestamp: '2026-08-21T10:00:01.000Z',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'governance browser smoke' }] },
    }),
    JSON.stringify({
      type: 'response_item', timestamp: '2026-08-21T10:00:02.000Z',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'browser replay ready' }] },
    }),
    '',
  ].join('\n'));
  return { projectRoot, projectPath };
};

const configureServer = async (server, locale, fixture) => {
  const setup = await requestJson(server.baseUrl, '/api/auth/setup');
  if (setup.payload.needsSetup) {
    await requestJson(server.baseUrl, '/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        authPassword: password,
        locale,
        appTheme: 'dark',
        dangerouslySkipPermissions: true,
        networkAccess: 'localhost',
      }),
    });
  }
  const login = await fetch(new URL('/api/auth/login', server.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!login.ok) throw new Error(`login failed with ${login.status}`);
  const cookie = login.headers.getSetCookie?.()[0] ?? login.headers.get('set-cookie');
  if (!cookie) throw new Error('login cookie missing');
  const token = await waitFor('browser smoke CLI token', async () => {
    const value = await fs.readFile(path.join(path.dirname(fixture.projectRoot), '.codexmux', 'cli-token'), 'utf8').catch(() => '');
    return value.trim() || null;
  });
  await requestJson(server.baseUrl, '/api/sessions/rebuild', { token, method: 'POST', body: '{}' });
  await waitFor('browser catalog rebuild', async () => {
    const health = await requestJson(server.baseUrl, '/api/sessions/health', { token });
    return health.payload.state === 'ready' && health.payload.indexedSessions === 1;
  });
  const rootPreview = await requestJson(server.baseUrl, '/api/governance/roots/preview', {
    token, method: 'POST', body: JSON.stringify({ path: fixture.projectRoot, label: 'Browser Projects' }),
  });
  const root = await requestJson(server.baseUrl, '/api/governance/roots/confirm', {
    token, method: 'POST', body: JSON.stringify({
      token: rootPreview.payload.token,
      digest: rootPreview.payload.digest,
      confirmation: 'APPROVE PROJECT ROOT',
    }),
  });
  await requestJson(server.baseUrl, '/api/governance/projects', {
    token, method: 'POST', body: JSON.stringify({
      approvedRootId: root.payload.id,
      title: 'Demo',
      path: fixture.projectPath,
    }),
  });
  await requestJson(server.baseUrl, '/api/governance/projects', { token });
  return cookie.split(';', 1)[0];
};

const addCookie = async (context, baseUrl, cookie) => {
  const separator = cookie.indexOf('=');
  await context.addCookies([{
    name: cookie.slice(0, separator),
    value: cookie.slice(separator + 1),
    url: baseUrl,
  }]);
};

const runLocale = async (browser, locale) => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), `codexmux-session-governance-browser-${locale}-`));
  const fixture = await prepareFixture(homeDir);
  const server = await startServer(homeDir, await getFreePort());
  try {
    const cookie = await configureServer(server, locale, fixture);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await addCookie(context, server.baseUrl, cookie);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const labels = locale === 'ko'
      ? {
          title: '세션 검색', query: '메시지 검색', search: '검색', replay: '세션 복기',
          governance: '프로젝트 거버넌스', writeDisabled: '쓰기 비활성', scaffold: '프로젝트 Scaffold',
          preview: '변경 미리보기', degraded: 'Governance Worker가 저하 상태입니다',
        }
      : {
          title: 'Session Explorer', query: 'Message search', search: 'Search', replay: 'Session replay',
          governance: 'Project Governance', writeDisabled: 'Writes disabled', scaffold: 'Project Scaffold',
          preview: 'Preview changes', degraded: 'Governance worker is degraded',
        };
    await page.goto(`${server.baseUrl}/sessions`, { waitUntil: 'networkidle', timeout: timeoutMs });
    if (await page.locator('html').getAttribute('lang') !== locale) throw new Error(`${locale} SSR locale mismatch`);
    await page.getByRole('heading', { name: labels.title }).waitFor({ timeout: timeoutMs });
    await page.getByRole('textbox', { name: labels.query }).fill('governance');
    await page.getByRole('button', { name: labels.search, exact: true }).click();
    const result = page.locator('div[role="option"]').first();
    await result.waitFor({ timeout: timeoutMs });
    await result.focus();
    if (!await result.evaluate((element) => element === document.activeElement)) throw new Error('search result focus failed');
    await result.press('Enter');
    await page.getByText(labels.replay, { exact: true }).waitFor({ timeout: timeoutMs });

    let intercepted = true;
    await page.route('**/api/governance/projects', async (route) => {
      if (!intercepted) return route.continue();
      intercepted = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'governance-worker-unavailable' }) });
    });
    await page.goto(`${server.baseUrl}/governance`, { waitUntil: 'networkidle', timeout: timeoutMs });
    await page.getByText(labels.degraded, { exact: true }).waitFor({ timeout: timeoutMs });
    await page.unroute('**/api/governance/projects');
    await page.reload({ waitUntil: 'networkidle', timeout: timeoutMs });
    await page.getByRole('heading', { name: labels.governance }).waitFor({ timeout: timeoutMs });
    await page.getByText(labels.writeDisabled, { exact: true }).first().waitFor({ timeout: timeoutMs });
    await page.getByText(labels.scaffold, { exact: true }).waitFor({ timeout: timeoutMs });
    if (!await page.getByRole('button', { name: labels.preview, exact: true }).isDisabled()) {
      throw new Error(`${locale} governance gate-off preview was enabled`);
    }
    const hydrationErrors = errors.filter((message) => /hydration|did not match/i.test(message));
    if (hydrationErrors.length > 0) {
      throw new Error(`${locale} hydration error: ${hydrationErrors.join(' | ')}`);
    }
    await context.close();
    return `${locale}-ssr-search-replay-governance-gate-off-recovery`;
  } finally {
    await server.stop();
    await fs.rm(homeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
};

const main = async () => {
  const executablePath = process.env.CODEXMUX_PLAYWRIGHT_EXECUTABLE_PATH;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const checks = [];
    for (const locale of ['ko', 'en']) checks.push(await runLocale(browser, locale));
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\/tmp\/codexmux-session-governance-browser-[^\s/]+/g, '[isolated-home]');
  console.error(message);
  process.exit(1);
});
