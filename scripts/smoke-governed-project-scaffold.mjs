#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const timeoutMs = 45_000;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
  });
  server.on('error', reject);
});

const waitFor = async (task) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await task().catch(() => null);
    if (result) return result;
    await sleep(150);
  }
  throw new Error('Governed scaffold smoke timed out.');
};

const request = async (baseUrl, token, pathname, init = {}) => {
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
  return { status: response.status, payload: text ? JSON.parse(text) : null };
};

const expectOk = async (...args) => {
  const result = await request(...args);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Request failed with ${result.status}: ${result.payload?.error ?? 'unknown'}`);
  }
  return result.payload;
};

const post = (baseUrl, token, pathname, body) => expectOk(baseUrl, token, pathname, {
  method: 'POST', body: JSON.stringify(body),
});

const snapshotTree = async (root) => {
  const entries = new Map();
  const visit = async (directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) await visit(absolute);
      else entries.set(relative, await fs.readFile(absolute, 'utf8'));
    }
  };
  await visit(root);
  return entries;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const main = async () => {
  if (process.platform !== 'linux') throw new Error('Governed scaffold smoke requires Linux.');
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-governed-scaffold-'));
  const projectRoot = path.join(homeDir, 'projects');
  const projectPath = path.join(projectRoot, 'demo');
  const sessionsRoot = path.join(homeDir, '.codex', 'sessions');
  await Promise.all([
    fs.mkdir(projectPath, { recursive: true }),
    fs.mkdir(sessionsRoot, { recursive: true }),
  ]);
  await fs.writeFile(path.join(projectPath, 'AGENTS.md'), '# Existing unmarked guidance\n');
  await fs.writeFile(path.join(projectPath, 'README.md'), '# Unrelated\n');
  await fs.writeFile(path.join(sessionsRoot, 'source.jsonl'), '{"source":"unchanged"}\n');
  const baseline = await snapshotTree(projectPath);
  const sessionsBaseline = await snapshotTree(sessionsRoot);
  const port = await getFreePort();
  const dataDirectory = path.join(homeDir, '.codexmux');
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    HOST: '127.0.0.1',
    PORT: String(port),
    CODEXMUX_RUNTIME_V2: '1',
    CODEXMUX_GOVERNANCE_WRITES: '1',
    CODEXMUX_RUNTIME_DB: path.join(dataDirectory, 'runtime-v2', 'state.db'),
    NEXT_TELEMETRY_DISABLED: '1',
  };
  delete env.__CMUX_PRISTINE_ENV;
  env.__CMUX_PRISTINE_ENV = JSON.stringify(env);
  const server = spawn('corepack', ['pnpm', 'exec', 'tsx', 'server.ts'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk.toString(); });
  server.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitFor(async () => {
      if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
      return fetch(new URL('/api/health', baseUrl)).then((response) => response.ok);
    });
    const token = await waitFor(async () => (await fs.readFile(path.join(dataDirectory, 'cli-token'), 'utf8')).trim());
    const rootPreview = await post(baseUrl, token, '/api/governance/roots/preview', {
      path: projectRoot, label: 'Smoke Projects',
    });
    const approvedRoot = await post(baseUrl, token, '/api/governance/roots/confirm', {
      token: rootPreview.token, digest: rootPreview.digest, confirmation: 'APPROVE PROJECT ROOT',
    });
    const project = await post(baseUrl, token, '/api/governance/projects', {
      approvedRootId: approvedRoot.id, title: 'Demo', path: projectPath,
    });

    const conflict = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['agents'], input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    assert(conflict.artifacts[0]?.state === 'conflict', 'Unmarked file did not fail closed.');

    const stale = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['agent-domain'], input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    await fs.mkdir(path.join(projectPath, 'docs', 'agents'), { recursive: true });
    await fs.writeFile(path.join(projectPath, 'docs', 'agents', 'domain.md'), '# External writer\n');
    const staleConfirm = await request(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/confirm`, {
      method: 'POST',
      body: JSON.stringify({ token: stale.token, digest: stale.digest, confirmation: 'Demo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    assert(staleConfirm.status === 409, 'Stale preview was not rejected.');
    await fs.rm(path.join(projectPath, 'docs'), { recursive: true });

    const createPreview = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['context', 'agent-domain'],
      input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    const created = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/confirm`, {
      token: createPreview.token, digest: createPreview.digest, confirmation: 'Demo',
    });
    assert(created.state === 'committed', 'Create transaction was not committed.');

    const updateTarget = path.join(projectPath, 'CONTEXT.md');
    const generatedContext = await fs.readFile(updateTarget, 'utf8');
    const manualContext = generatedContext.replace('## Product Boundary', '## Product Boundary\n\nManual marker edit');
    await fs.writeFile(updateTarget, manualContext);
    const updatePreview = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['context'], input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    assert(updatePreview.artifacts[1]?.state === 'marker-update', 'Marker update was not previewed.');
    const updated = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/confirm`, {
      token: updatePreview.token, digest: updatePreview.digest, confirmation: 'Demo',
    });
    assert(updated.state === 'committed', 'Marker update was not committed.');
    const rollbackPreview = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${updated.id}/rollback/preview`,
      {},
    );
    const rolledBack = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${updated.id}/rollback/confirm`,
      { token: rollbackPreview.token, digest: rollbackPreview.digest, confirmation: 'Demo' },
    );
    assert(rolledBack.state === 'rolled-back', 'Marker update rollback failed.');
    assert(await fs.readFile(updateTarget, 'utf8') === manualContext, 'Exact preimage was not restored.');

    const actionManifest = path.join(dataDirectory, 'backups', 'governance-actions', project.id, created.id, 'action.json');
    const backupMode = (await fs.stat(path.dirname(actionManifest))).mode & 0o777;
    const manifestMode = (await fs.stat(actionManifest)).mode & 0o777;
    assert(backupMode === 0o700 && manifestMode === 0o600, 'Backup permissions are not private.');
    assert((await snapshotTree(sessionsRoot)).get('source.jsonl') === sessionsBaseline.get('source.jsonl'), 'Codex source changed.');
    assert((await fs.readFile(path.join(projectPath, 'AGENTS.md'), 'utf8')) === baseline.get('AGENTS.md'), 'Unselected AGENTS.md changed.');
    assert((await fs.readFile(path.join(projectPath, 'README.md'), 'utf8')) === baseline.get('README.md'), 'Unrelated README.md changed.');

    console.log(JSON.stringify({
      ok: true,
      checks: [
        'unmarked-conflict', 'stale-preview', 'transaction-create', 'marker-update',
        'exact-preimage-rollback', 'private-backup-modes', 'unselected-tree-preserved',
      ],
    }, null, 2));
  } finally {
    if (server.exitCode === null) {
      server.kill('SIGINT');
      await Promise.race([
        new Promise((resolve) => server.once('exit', resolve)),
        sleep(8_000).then(() => server.exitCode === null && server.kill('SIGTERM')),
      ]);
    }
    await fs.rm(homeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
