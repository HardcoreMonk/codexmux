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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertAppArea = async (page, variant, expectedHref, label) => {
  const navigation = page.locator(`nav[data-variant="${variant}"]`);
  await navigation.waitFor({ timeout: timeoutMs });
  const current = navigation.locator('[aria-current="page"]');
  const expectedCount = expectedHref ? 1 : 0;
  assert(await current.count() === expectedCount, `${label} current app area count mismatch`);
  if (expectedHref) {
    assert(await current.getAttribute('href') === expectedHref, `${label} current app area href mismatch`);
  }
  return navigation;
};

const assertMinimumTarget = async (locator, minimum, label) => {
  const box = await locator.boundingBox();
  const tolerance = 0.01;
  assert(
    !!box && box.width + tolerance >= minimum && box.height + tolerance >= minimum,
    `${label} target is smaller than ${minimum}px (${box ? `${box.width}x${box.height}` : 'missing'})`,
  );
};

const captureNavigation = async (page, name, selector) => {
  const artifactDir = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR;
  if (!artifactDir) return;
  await fs.mkdir(artifactDir, { recursive: true });
  await page.locator('nextjs-portal').evaluateAll((elements) => {
    for (const element of elements) element.setAttribute('hidden', '');
  });
  const target = page.locator(selector);
  await target.screenshot({ path: path.join(artifactDir, `${name}-dark.png`) });
  const originalClass = await page.locator('html').getAttribute('class');
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await page.waitForTimeout(300);
  await target.screenshot({ path: path.join(artifactDir, `${name}-light.png`) });
  await page.evaluate((className) => {
    if (className === null) document.documentElement.removeAttribute('class');
    else document.documentElement.setAttribute('class', className);
  }, originalClass);
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

const startServer = async (homeDir, port, writesEnabled = false) => {
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    SHELL: '/bin/sh',
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
    CODEXMUX_RUNTIME_V2: '1',
    ...(writesEnabled ? { CODEXMUX_GOVERNANCE_WRITES: '1' } : {}),
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
  await fs.mkdir(path.join(projectPath, 'docs', 'agents'), { recursive: true });
  await fs.writeFile(path.join(projectPath, 'docs', 'agents', 'issue-tracker.md'), '# Existing issue rules\n');
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
          activity: '활동', collapse: '사이드바 접기', expand: '사이드바 펼치기',
          openMenu: '메뉴 열기', sessionsArea: '세션', governanceArea: '거버넌스',
          notes: '노트', stats: '사용량 통계', appInfo: '앱 정보',
        }
      : {
          title: 'Session Explorer', query: 'Message search', search: 'Search', replay: 'Session replay',
          governance: 'Project Governance', writeDisabled: 'Writes disabled', scaffold: 'Project Scaffold',
          preview: 'Preview changes', degraded: 'Governance worker is degraded',
          activity: 'Activity', collapse: 'Collapse sidebar', expand: 'Expand sidebar',
          openMenu: 'Open menu', sessionsArea: 'Sessions', governanceArea: 'Governance',
          notes: 'Notes', stats: 'Usage stats', appInfo: 'App Info',
        };

    await page.goto(`${server.baseUrl}/`, { waitUntil: 'networkidle', timeout: timeoutMs });
    await assertAppArea(page, 'desktop', '/', `${locale} desktop workspace`);
    await page.evaluate(() => localStorage.setItem('sidebar-tab', 'sessions'));
    await page.reload({ waitUntil: 'networkidle', timeout: timeoutMs });
    const activityTab = page.getByRole('tab', { name: labels.activity, exact: true });
    await activityTab.waitFor({ timeout: timeoutMs });
    assert(await activityTab.getAttribute('aria-selected') === 'true', `${locale} legacy activity tab was not normalized`);
    await page.getByRole('button', { name: labels.collapse, exact: true }).click();
    const rail = await assertAppArea(page, 'rail', '/', `${locale} desktop collapsed workspace`);
    await assertMinimumTarget(rail.locator('a').first(), 40, `${locale} desktop rail`);
    await page.getByRole('button', { name: labels.expand, exact: true }).click({ force: true });
    await assertAppArea(page, 'desktop', '/', `${locale} desktop expanded workspace`);

    await page.goto(`${server.baseUrl}/reports`, { waitUntil: 'networkidle', timeout: timeoutMs });
    await assertAppArea(page, 'desktop', null, `${locale} desktop utility`);

    await page.goto(`${server.baseUrl}/sessions`, { waitUntil: 'networkidle', timeout: timeoutMs });
    if (await page.locator('html').getAttribute('lang') !== locale) throw new Error(`${locale} SSR locale mismatch`);
    await assertAppArea(page, 'desktop', '/sessions', `${locale} desktop sessions`);
    await page.getByRole('heading', { name: labels.title }).waitFor({ timeout: timeoutMs });
    await page.getByRole('textbox', { name: labels.query }).fill('governance');
    await page.getByRole('button', { name: labels.search, exact: true }).click();
    const result = page.locator('div[role="option"]').first();
    await result.waitFor({ timeout: timeoutMs });
    await result.focus();
    if (!await result.evaluate((element) => element === document.activeElement)) throw new Error('search result focus failed');
    assert(await result.getAttribute('aria-selected') === 'true', `${locale} focused session result was not selected`);
    assert(await result.locator('[data-selection-marker="true"]').count() === 1, `${locale} session selection marker missing`);
    await captureNavigation(page, `${locale}-desktop-sessions-navigation`, '[data-desktop-sidebar="true"]');
    await result.press('Enter');
    await page.getByText(labels.replay, { exact: true }).waitFor({ timeout: timeoutMs });
    assert(await result.getAttribute('aria-selected') === 'true', `${locale} replay cleared session selection`);

    let intercepted = true;
    await page.route('**/api/governance/projects', async (route) => {
      if (!intercepted) return route.continue();
      intercepted = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'governance-worker-unavailable' }) });
    });
    await page.goto(`${server.baseUrl}/governance`, { waitUntil: 'networkidle', timeout: timeoutMs });
    await assertAppArea(page, 'desktop', '/governance', `${locale} desktop governance degraded`);
    await page.getByText(labels.degraded, { exact: true }).waitFor({ timeout: timeoutMs });
    await page.unroute('**/api/governance/projects');
    await page.reload({ waitUntil: 'networkidle', timeout: timeoutMs });
    await assertAppArea(page, 'desktop', '/governance', `${locale} desktop governance`);
    await page.getByRole('heading', { name: labels.governance }).waitFor({ timeout: timeoutMs });
    await page.getByText(labels.writeDisabled, { exact: true }).first().waitFor({ timeout: timeoutMs });
    await page.getByText(labels.scaffold, { exact: true }).waitFor({ timeout: timeoutMs });
    if (!await page.getByRole('button', { name: labels.preview, exact: true }).isDisabled()) {
      throw new Error(`${locale} governance gate-off preview was enabled`);
    }
    const selectedProject = page.locator('aside [role="listbox"] [role="option"][aria-selected="true"]').first();
    await selectedProject.waitFor({ timeout: timeoutMs });
    assert(await selectedProject.locator('[data-selection-marker="true"]').count() === 1, `${locale} project selection marker missing`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.baseUrl}/sessions`, { waitUntil: 'networkidle', timeout: timeoutMs });
    const mobileSessions = await assertAppArea(page, 'mobile-bottom', '/sessions', `${locale} mobile sessions`);
    for (const link of await mobileSessions.locator('a').all()) {
      await assertMinimumTarget(link, 44, `${locale} mobile primary navigation`);
    }
    assert(await page.locator('[data-mobile-workspace-tab-bar="true"]').count() === 0, `${locale} sessions rendered workspace tab bar`);
    assert(await page.locator('header').first().getByText(labels.sessionsArea, { exact: true }).count() === 1, `${locale} mobile sessions header mismatch`);

    await page.goto(`${server.baseUrl}/governance`, { waitUntil: 'networkidle', timeout: timeoutMs });
    await assertAppArea(page, 'mobile-bottom', '/governance', `${locale} mobile governance`);
    assert(await page.locator('[data-mobile-workspace-tab-bar="true"]').count() === 0, `${locale} governance rendered workspace tab bar`);
    assert(await page.locator('header').first().getByText(labels.governanceArea, { exact: true }).count() === 1, `${locale} mobile governance header mismatch`);
    await page.getByRole('button', { name: labels.openMenu, exact: true }).click();
    await assertAppArea(page, 'mobile-sheet', '/governance', `${locale} mobile sheet governance`);
    await assertMinimumTarget(page.getByRole('button', { name: labels.notes, exact: true }), 44, `${locale} mobile notes utility`);
    await assertMinimumTarget(page.getByRole('button', { name: labels.stats, exact: true }), 44, `${locale} mobile stats utility`);
    await assertMinimumTarget(page.getByRole('button', { name: labels.appInfo, exact: true }), 44, `${locale} mobile app info utility`);
    await captureNavigation(page, `${locale}-mobile-governance-navigation`, '[data-slot="sheet-content"]');

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

const runAdoptionLocale = async (browser, locale) => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), `codexmux-session-governance-browser-${locale}-adoption-`));
  const fixture = await prepareFixture(homeDir);
  const server = await startServer(homeDir, await getFreePort(), true);
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
          summary: '프로젝트 요약', preview: '변경 미리보기', available: '기존 파일 관리 등록 가능',
          agents: 'AGENTS.md 등록', issue: 'docs/agents/issue-tracker.md 등록',
          repreview: '선택 반영 후 다시 미리보기',
          warning: '기존 본문은 유지하고 관리 블록만 추가합니다. 기존 지침과 충돌 여부를 직접 확인하세요.',
          confirm: '계속하려면 프로젝트 이름 “Demo”을 정확히 입력하세요.', apply: 'Scaffold 적용',
          committed: 'Scaffold 작업을 완료했습니다.',
        }
      : {
          summary: 'Project summary', preview: 'Preview changes', available: 'Existing file available for adoption',
          agents: 'Adopt AGENTS.md', issue: 'Adopt docs/agents/issue-tracker.md',
          repreview: 'Re-preview selected adoption',
          warning: 'Keep the existing body and append only the managed block. Review it for conflicts with existing guidance.',
          confirm: 'Enter the exact project title “Demo” to continue.', apply: 'Apply scaffold',
          committed: 'Scaffold action completed.',
        };

    await page.goto(`${server.baseUrl}/governance`, { waitUntil: 'networkidle', timeout: timeoutMs });
    await page.getByLabel(labels.summary, { exact: true }).fill('Browser adoption smoke');
    await page.getByRole('button', { name: labels.preview, exact: true }).click();
    await page.getByText(labels.available, { exact: false }).first().waitFor({ timeout: timeoutMs });
    if (await page.getByText(labels.confirm, { exact: true }).count() !== 0) {
      throw new Error(`${locale} first-pass adoption exposed exact-title confirmation`);
    }
    const sheet = page.locator('[data-slot="sheet-content"]');
    const agents = sheet.locator('label').filter({ hasText: labels.agents }).locator('[role="checkbox"]');
    const issue = sheet.locator('label').filter({ hasText: labels.issue }).locator('[role="checkbox"]');
    if (await agents.count() !== 1 || await issue.count() !== 1) {
      throw new Error(`${locale} adoption controls missing: ${(await sheet.innerText()).slice(0, 2000)}`);
    }
    if (await agents.getAttribute('aria-checked') !== 'false'
      || await issue.getAttribute('aria-checked') !== 'false') {
      throw new Error(`${locale} adoption selection was not unchecked by default`);
    }
    await agents.click();
    await page.getByRole('button', { name: labels.repreview, exact: true }).click();
    await page.getByText(labels.warning, { exact: true }).waitFor({ timeout: timeoutMs });
    await page.getByLabel(labels.confirm, { exact: true }).fill('Demo');
    await page.getByRole('button', { name: labels.apply, exact: true }).click();
    await page.getByText(labels.committed, { exact: true }).waitFor({ timeout: timeoutMs });

    const agentsBytes = await fs.readFile(path.join(fixture.projectPath, 'AGENTS.md'));
    const agentsPrefix = Buffer.from('# Guidance\n');
    if (!agentsBytes.subarray(0, agentsPrefix.length).equals(agentsPrefix)
      || !agentsBytes.includes(Buffer.from('BEGIN CODEXMUX:project-agents-adopted:v1'))) {
      throw new Error(`${locale} browser adoption did not preserve the AGENTS.md prefix`);
    }
    if (await fs.readFile(path.join(fixture.projectPath, 'docs', 'agents', 'issue-tracker.md'), 'utf8')
      !== '# Existing issue rules\n') {
      throw new Error(`${locale} unchecked browser adoption target changed`);
    }
    const hydrationErrors = errors.filter((message) => /hydration|did not match/i.test(message));
    if (hydrationErrors.length > 0) {
      throw new Error(`${locale} adoption hydration error: ${hydrationErrors.join(' | ')}`);
    }
    await context.close();
    return `${locale}-governed-selective-adoption`;
  } finally {
    await server.stop();
    await fs.rm(homeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
};

const main = async () => {
  const executablePath = process.env.CODEXMUX_PLAYWRIGHT_EXECUTABLE_PATH;
  const scope = process.env.CODEXMUX_SESSION_GOVERNANCE_BROWSER_SCOPE || 'all';
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const checks = [];
    if (scope !== 'adoption') {
      for (const locale of ['ko', 'en']) checks.push(await runLocale(browser, locale));
    }
    if (scope !== 'gate') {
      for (const locale of ['ko', 'en']) checks.push(await runAdoptionLocale(browser, locale));
    }
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
