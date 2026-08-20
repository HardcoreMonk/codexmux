#!/usr/bin/env node
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { WebSocket } from 'ws';
import {
  diffReadonlyTreeSnapshots,
  isPrivateDatabaseMode,
  snapshotReadonlyTree,
  validateLinuxSessionGovernanceSmoke,
} from './linux-session-governance-smoke-lib.mjs';
import {
  appendRuntimeV2SmokeFrame,
  encodeStdin,
  runtimeV2SmokeWsUrl,
} from './runtime-v2-smoke-lib.mjs';

const rootDir = process.cwd();
const timeoutMs = Number(process.env.CODEXMUX_LINUX_SESSION_GOVERNANCE_TIMEOUT_MS || 45_000);
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

const waitFor = async (label, operation, timeout = timeoutMs) => {
  const deadline = Date.now() + timeout;
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

const requestJson = async (baseUrl, token, pathname, init = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      'x-cmux-token': token,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} failed with ${response.status}`);
  return payload;
};

const readChildren = async (pid) => {
  const value = await fs.readFile(`/proc/${pid}/task/${pid}/children`, 'utf8').catch(() => '');
  return value.trim().split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
};

const listDescendants = async (rootPid) => {
  const found = [];
  const queue = [rootPid];
  const visited = new Set();
  while (queue.length > 0) {
    const pid = queue.shift();
    if (!pid || visited.has(pid)) continue;
    visited.add(pid);
    for (const child of await readChildren(pid)) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
};

const findWorkerPid = async (serverPid, workerName, excludedPid = null) => waitFor(`${workerName} pid`, async () => {
  for (const pid of await listDescendants(serverPid)) {
    if (pid === excludedPid) continue;
    const cmdline = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
    if (cmdline.includes(workerName)) return pid;
  }
  return null;
});

const quarantineDatabase = async (dbPath) => {
  const moved = [];
  for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      const target = `${filePath}.quarantine`;
      await fs.rename(filePath, target);
      moved.push(path.basename(target));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return moved;
};

const recycleWorkerWithQuarantine = async ({ serverPid, workerName, dbPath }) => {
  const pid = await findWorkerPid(serverPid, workerName);
  process.kill(pid, 'SIGSTOP');
  const moved = await quarantineDatabase(dbPath);
  process.kill(pid, 'SIGKILL');
  await findWorkerPid(serverPid, workerName, pid);
  return moved.length > 0;
};

const waitForTerminalMarker = (baseUrl, token, sessionName, marker) => new Promise((resolve, reject) => {
  let output = '';
  let settled = false;
  const socket = new WebSocket(runtimeV2SmokeWsUrl(baseUrl, sessionName), {
    headers: { 'x-cmux-token': token },
  });
  const timer = setTimeout(() => {
    settled = true;
    socket.close();
    reject(new Error('terminal marker timed out'));
  }, timeoutMs);
  socket.on('open', () => socket.send(encodeStdin(`printf ${marker}\\n\n`)));
  socket.on('message', (data) => {
    output = appendRuntimeV2SmokeFrame(output, data);
    if (!output.includes(marker) || settled) return;
    settled = true;
    clearTimeout(timer);
    socket.close();
    resolve(true);
  });
  socket.on('error', (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    reject(error);
  });
});

const startServer = async ({ homeDir, port, dbPath }) => {
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    SHELL: '/bin/sh',
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
    CODEXMUX_RUNTIME_V2: '1',
    CODEXMUX_SESSION_CATALOG_MODE: 'default',
    CODEXMUX_RUNTIME_DB: dbPath,
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
  await waitFor('server startup', async () => {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    return fetch(new URL('/api/health', baseUrl)).then((response) => response.ok).catch(() => false);
  });
  const token = await waitFor('CLI token', async () => {
    const value = await fs.readFile(path.join(homeDir, '.codexmux', 'cli-token'), 'utf8').catch(() => '');
    return value.trim() || null;
  });
  return {
    child,
    baseUrl,
    token,
    getOutput: () => output,
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

const writeFixtures = async (homeDir) => {
  const projectRoot = path.join(homeDir, 'projects');
  const projectPath = path.join(projectRoot, 'demo');
  const sessionsRoot = path.join(homeDir, '.codex', 'sessions', '2026', '08', '21');
  await Promise.all([
    fs.mkdir(path.join(projectPath, 'docs', 'superpowers', 'specs'), { recursive: true }),
    fs.mkdir(sessionsRoot, { recursive: true }),
  ]);
  await fs.writeFile(path.join(projectPath, 'AGENTS.md'), '# Guidance\n\nOPENAI_API_KEY=sk-proj-smoke-private\n');
  await fs.writeFile(path.join(projectPath, 'docs', 'superpowers', 'specs', 'feature.md'), '# Feature Spec\n');
  await fs.writeFile(path.join(projectRoot, 'projects.yaml'), [
    'projects:',
    '  - id: demo',
    '    title: Demo',
    `    path: ${projectPath}`,
    '',
  ].join('\n'));
  const sessionId = 'linux-smoke-session';
  await fs.writeFile(path.join(sessionsRoot, `${sessionId}.jsonl`), [
    JSON.stringify({
      type: 'session_meta', timestamp: '2026-08-21T10:00:00.000Z',
      payload: { id: sessionId, cwd: projectPath, model: 'gpt-5.6' },
    }),
    JSON.stringify({
      type: 'response_item', timestamp: '2026-08-21T10:00:01.000Z',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Linux governance smoke search' }] },
    }),
    JSON.stringify({
      type: 'response_item', timestamp: '2026-08-21T10:00:02.000Z',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Search and replay are ready.' }] },
    }),
    '',
  ].join('\n'));
  return { projectRoot, projectPath, sessionsRoot, sessionId };
};

const main = async () => {
  if (process.platform !== 'linux') throw new Error('Linux smoke requires Linux.');
  if (spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status !== 0) throw new Error('Linux smoke requires tmux.');
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-linux-session-governance-'));
  const dbPath = path.join(homeDir, 'runtime-v2', 'state.db');
  const fixtures = await writeFixtures(homeDir);
  const projectBefore = await snapshotReadonlyTree(fixtures.projectRoot);
  const sessionsBefore = await snapshotReadonlyTree(fixtures.sessionsRoot);
  const port = await getFreePort();
  let server = null;
  let workspaceId = null;
  try {
    server = await startServer({ homeDir, port, dbPath });
    const { baseUrl, token } = server;
    const workspace = await requestJson(baseUrl, token, '/api/v2/workspaces', {
      method: 'POST', body: JSON.stringify({ name: 'Smoke', defaultCwd: fixtures.projectPath }),
    });
    workspaceId = workspace.id;
    const tab = await requestJson(baseUrl, token, '/api/v2/tabs', {
      method: 'POST', body: JSON.stringify({ workspaceId: workspace.id, paneId: workspace.rootPaneId, cwd: fixtures.projectPath }),
    });
    await waitForTerminalMarker(baseUrl, token, tab.sessionName, 'terminal-before-rollback');

    await requestJson(baseUrl, token, '/api/sessions/rebuild', { method: 'POST', body: '{}' });
    await waitFor('catalog rebuild', async () => {
      const health = await requestJson(baseUrl, token, '/api/sessions/health');
      return health.state === 'ready' && health.rebuildState === 'idle' && health.indexedSessions === 1;
    });
    const search = await requestJson(baseUrl, token, '/api/sessions/search?query=governance&limit=10');
    const replay = await requestJson(baseUrl, token, `/api/sessions/${fixtures.sessionId}/entries?limit=20`);
    const annotation = await requestJson(baseUrl, token, `/api/sessions/${fixtures.sessionId}/annotation`, {
      method: 'PUT', body: JSON.stringify({ pinned: true, tags: ['smoke'], expectedVersion: 0 }),
    });

    const rootPreview = await requestJson(baseUrl, token, '/api/governance/roots/preview', {
      method: 'POST', body: JSON.stringify({ path: fixtures.projectRoot, label: 'Smoke Projects' }),
    });
    const approvedRoot = await requestJson(baseUrl, token, '/api/governance/roots/confirm', {
      method: 'POST', body: JSON.stringify({
        token: rootPreview.token, digest: rootPreview.digest, confirmation: 'APPROVE PROJECT ROOT',
      }),
    });
    const importPreview = await requestJson(baseUrl, token, '/api/governance/import/preview', {
      method: 'POST', body: JSON.stringify({ approvedRootId: approvedRoot.id }),
    });
    const imported = await requestJson(baseUrl, token, '/api/governance/import/confirm', {
      method: 'POST', body: JSON.stringify({
        approvedRootId: approvedRoot.id,
        token: importPreview.token,
        digest: importPreview.digest,
        sourceFingerprint: importPreview.sourceFingerprint,
        confirmation: 'IMPORT PROJECTS',
        selections: importPreview.actions.map((action) => ({
          externalId: action.externalId,
          selectedFields: action.status === 'unchanged' ? [] : ['title', 'relativePath'],
        })),
      }),
    });
    const catalog = await requestJson(baseUrl, token, '/api/governance/projects');
    const project = catalog.projects.find((candidate) => candidate.externalId === 'demo');
    if (!project) throw new Error('imported project missing');
    const [summary, documents, lifecycle, audit] = await Promise.all([
      requestJson(baseUrl, token, `/api/governance/projects/${project.id}/summary`),
      requestJson(baseUrl, token, `/api/governance/projects/${project.id}/documents`),
      requestJson(baseUrl, token, `/api/governance/projects/${project.id}/lifecycle`),
      requestJson(baseUrl, token, `/api/governance/projects/${project.id}/audit`),
    ]);

    const governanceDb = path.join(homeDir, '.codexmux', 'governance', 'index.db');
    const catalogDb = path.join(homeDir, '.codexmux', 'session-catalog', 'index.db');
    const databasePrivate = (await Promise.all([dbPath, governanceDb, catalogDb].map(async (filePath) =>
      isPrivateDatabaseMode((await fs.stat(filePath)).mode)))).every(Boolean);

    const governanceRecycled = await recycleWorkerWithQuarantine({
      serverPid: server.child.pid,
      workerName: 'governance-worker',
      dbPath: governanceDb,
    });
    await waitFor('governance recovery', async () => {
      const result = await requestJson(baseUrl, token, '/api/governance/projects');
      return result.health?.state === 'ready' && result.projects.length === 1;
    });
    const catalogRecycled = await recycleWorkerWithQuarantine({
      serverPid: server.child.pid,
      workerName: 'timeline-worker',
      dbPath: catalogDb,
    });
    await waitFor('timeline worker recovery', async () => {
      const health = await requestJson(baseUrl, token, '/api/v2/runtime/health');
      return health.timeline?.ok === true;
    });
    await requestJson(baseUrl, token, '/api/sessions/rebuild', { method: 'POST', body: '{}' });
    await waitFor('catalog rebuild after quarantine', async () => {
      const health = await requestJson(baseUrl, token, '/api/sessions/health');
      return health.state === 'ready' && health.rebuildState === 'idle' && health.indexedSessions === 1;
    });
    await waitForTerminalMarker(baseUrl, token, tab.sessionName, 'terminal-after-rollback');

    const projectAfter = await snapshotReadonlyTree(fixtures.projectRoot);
    const sessionsAfter = await snapshotReadonlyTree(fixtures.sessionsRoot);
    const result = validateLinuxSessionGovernanceSmoke({
      search: search.total === 1,
      replay: Array.isArray(replay.entries) && replay.entries.length >= 2,
      annotation: annotation.pinned === true && annotation.tags?.includes('smoke'),
      rootApproval: approvedRoot.label === 'Smoke Projects' && !JSON.stringify(approvedRoot).includes(fixtures.projectRoot),
      projectImport: imported.counts?.add === 1,
      governance: summary.readOnly === true
        && documents.documents?.length >= 2
        && lifecycle.stage === 'domain-architecture'
        && audit.candidates?.length === 1
        && !JSON.stringify(audit).includes('smoke-private'),
      projectUnchanged: diffReadonlyTreeSnapshots(projectBefore, projectAfter).length === 0
        && diffReadonlyTreeSnapshots(sessionsBefore, sessionsAfter).length === 0,
      databasePrivate,
      rollbackRecovered: governanceRecycled && catalogRecycled,
      terminalStayedConnected: true,
    });
    if (!result.ok) throw new Error(`smoke checks failed: ${result.failures.join(',')}`);
    console.log(JSON.stringify({ ok: true, checks: result.checks }, null, 2));
  } finally {
    if (server && workspaceId) {
      await requestJson(server.baseUrl, server.token, `/api/v2/workspaces/${workspaceId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    await server?.stop();
    await fs.rm(homeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
};

main().catch((error) => {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\/tmp\/codexmux-linux-session-governance-[^\s/]+/g, '[isolated-home]')
    .replace(/(?:sk-proj-|Bearer\s+)[A-Za-z0-9._-]+/g, '[credential]');
  console.error(message);
  process.exit(1);
});
