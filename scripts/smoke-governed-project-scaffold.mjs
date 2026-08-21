#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const timeoutMs = Number(process.env.CODEXMUX_GOVERNED_SCAFFOLD_TIMEOUT_MS || 45_000);
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
    fs.mkdir(path.join(projectPath, 'docs', 'agents'), { recursive: true }),
    fs.mkdir(sessionsRoot, { recursive: true }),
  ]);
  const originalAgents = Buffer.from('# Existing unmarked guidance\n');
  const originalIssueTracker = Buffer.from('# Existing issue rules\r\nUser rule\r\n');
  const originalTriageLabels = Buffer.from('# Existing triage rules');
  await fs.writeFile(path.join(projectPath, 'AGENTS.md'), originalAgents);
  await fs.writeFile(path.join(projectPath, 'docs', 'agents', 'issue-tracker.md'), originalIssueTracker);
  await fs.writeFile(path.join(projectPath, 'docs', 'agents', 'triage-labels.md'), originalTriageLabels);
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

    await fs.writeFile(path.join(projectPath, 'CONTEXT.md'), Buffer.from([0xc3, 0x28]));
    const invalidUtf8 = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['context'], input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    assert(
      invalidUtf8.artifacts[1]?.errorCode === 'scaffold-adoption-invalid-utf8',
      'Invalid UTF-8 adoption target did not fail closed.',
    );
    await fs.unlink(path.join(projectPath, 'CONTEXT.md'));

    const domainPath = path.join(projectPath, 'docs', 'agents', 'domain.md');
    await fs.writeFile(domainPath, Buffer.from('before\0after'));
    const nulPreview = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['agent-domain'], input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    assert(nulPreview.artifacts[5]?.errorCode === 'governance-artifact-not-text', 'NUL target did not fail closed.');
    await fs.writeFile(domainPath, '<!-- BEGIN CODEXMUX:unknown -->\n');
    const markerConflict = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['agent-domain'], input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    assert(
      markerConflict.artifacts[5]?.errorCode === 'scaffold-adoption-marker-conflict',
      'Marker-like target did not fail closed.',
    );
    await fs.unlink(domainPath);

    const discovery = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/preview`, {
      artifacts: ['agents', 'agent-issue-tracker', 'agent-triage-labels'],
      input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    });
    assert(
      ['agents', 'agent-issue-tracker', 'agent-triage-labels'].every((id) =>
        discovery.artifacts.find((artifact) => artifact.id === id)?.state === 'adoption-available'),
      'Unmarked adoption discovery was incomplete.',
    );
    const discoveryConfirm = await request(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/confirm`, {
      method: 'POST',
      body: JSON.stringify({ token: discovery.token, digest: discovery.digest, confirmation: 'Demo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    assert(
      discoveryConfirm.status === 409 && discoveryConfirm.payload?.error === 'scaffold-adoption-selection-required',
      'First-pass adoption preview was confirmable.',
    );

    const adoptionRequest = {
      artifacts: ['agents', 'agent-issue-tracker'],
      adoptArtifacts: ['agents', 'agent-issue-tracker'],
      input: { title: 'Demo', summary: 'Smoke project', uiProject: false },
    };
    const staleAdoption = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/scaffold/preview`,
      adoptionRequest,
    );
    await fs.writeFile(path.join(projectPath, 'AGENTS.md'), '# External writer\n');
    const staleAdoptionConfirm = await request(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/scaffold/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ token: staleAdoption.token, digest: staleAdoption.digest, confirmation: 'Demo' }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    assert(staleAdoptionConfirm.status === 409, 'Stale adoption preview was not rejected.');
    await fs.writeFile(path.join(projectPath, 'AGENTS.md'), originalAgents);

    const adoptionPreview = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/scaffold/preview`,
      adoptionRequest,
    );
    assert(
      ['agents', 'agent-issue-tracker'].every((id) =>
        adoptionPreview.artifacts.find((artifact) => artifact.id === id)?.state === 'adopt'),
      'Selected adoption was not previewed.',
    );
    const adopted = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/confirm`, {
      token: adoptionPreview.token, digest: adoptionPreview.digest, confirmation: 'Demo',
    });
    assert(adopted.state === 'committed', 'Adoption transaction was not committed.');
    const adoptedAgents = await fs.readFile(path.join(projectPath, 'AGENTS.md'));
    const adoptedIssueTracker = await fs.readFile(path.join(projectPath, 'docs', 'agents', 'issue-tracker.md'));
    assert(adoptedAgents.subarray(0, originalAgents.length).equals(originalAgents), 'LF adoption changed existing bytes.');
    assert(
      adoptedIssueTracker.subarray(0, originalIssueTracker.length).equals(originalIssueTracker),
      'CRLF adoption changed existing bytes.',
    );
    const issueSuffix = adoptedIssueTracker.subarray(originalIssueTracker.length).toString('utf8');
    assert(!/(^|[^\r])\n/.test(issueSuffix), 'CRLF adoption introduced a lone LF.');
    assert(
      (await fs.readFile(path.join(projectPath, 'docs', 'agents', 'triage-labels.md'))).equals(originalTriageLabels),
      'Unchecked adoption target changed.',
    );

    const adoptedUpdatePreview = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/scaffold/preview`,
      { artifacts: ['agents'], input: { title: 'Demo', summary: 'Smoke project', uiProject: true } },
    );
    assert(
      adoptedUpdatePreview.artifacts[0]?.state === 'marker-update'
        && adoptedUpdatePreview.artifacts[0]?.templateId === 'project-agents-adopted',
      'Adopted marker update switched variants.',
    );
    const adoptedUpdate = await post(baseUrl, token, `/api/governance/projects/${project.id}/scaffold/confirm`, {
      token: adoptedUpdatePreview.token, digest: adoptedUpdatePreview.digest, confirmation: 'Demo',
    });
    const staleRollbackPreview = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${adopted.id}/rollback/preview`,
      {},
    );
    const staleRollback = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${adopted.id}/rollback/confirm`,
      { token: staleRollbackPreview.token, digest: staleRollbackPreview.digest, confirmation: 'Demo' },
    );
    assert(staleRollback.state === 'rollback-stale', 'Out-of-order adoption rollback was not rejected.');
    const latestRollbackPreview = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${adoptedUpdate.id}/rollback/preview`,
      {},
    );
    const latestRollback = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${adoptedUpdate.id}/rollback/confirm`,
      { token: latestRollbackPreview.token, digest: latestRollbackPreview.digest, confirmation: 'Demo' },
    );
    assert(latestRollback.state === 'rolled-back', 'Latest adopted marker update rollback failed.');
    const adoptionRollbackPreview = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${adopted.id}/rollback/preview`,
      {},
    );
    const adoptionRollback = await post(
      baseUrl,
      token,
      `/api/governance/projects/${project.id}/actions/${adopted.id}/rollback/confirm`,
      { token: adoptionRollbackPreview.token, digest: adoptionRollbackPreview.digest, confirmation: 'Demo' },
    );
    assert(adoptionRollback.state === 'rolled-back', 'Adoption rollback failed.');
    assert((await fs.readFile(path.join(projectPath, 'AGENTS.md'))).equals(originalAgents), 'AGENTS preimage was not exact.');
    assert(
      (await fs.readFile(path.join(projectPath, 'docs', 'agents', 'issue-tracker.md'))).equals(originalIssueTracker),
      'Issue tracker preimage was not exact.',
    );

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
    await fs.unlink(path.join(projectPath, 'docs', 'agents', 'domain.md'));

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
    const adoptionManifest = path.join(dataDirectory, 'backups', 'governance-actions', project.id, adopted.id, 'action.json');
    const adoptionJournal = JSON.parse(await fs.readFile(adoptionManifest, 'utf8'));
    assert(
      adoptionJournal.artifacts.every((artifact) => artifact.state === 'marker-update'),
      'Adoption leaked a new durable manifest state.',
    );
    assert(
      (await Promise.all(adoptionJournal.artifacts.map((artifact) => fs.stat(artifact.preimagePath))))
        .every((stat) => (stat.mode & 0o777) === 0o600),
      'Adoption preimage permissions are not private.',
    );
    const backupMode = (await fs.stat(path.dirname(actionManifest))).mode & 0o777;
    const manifestMode = (await fs.stat(actionManifest)).mode & 0o777;
    assert(backupMode === 0o700 && manifestMode === 0o600, 'Backup permissions are not private.');
    assert((await snapshotTree(sessionsRoot)).get('source.jsonl') === sessionsBaseline.get('source.jsonl'), 'Codex source changed.');
    assert((await fs.readFile(path.join(projectPath, 'AGENTS.md'), 'utf8')) === baseline.get('AGENTS.md'), 'Unselected AGENTS.md changed.');
    assert((await fs.readFile(path.join(projectPath, 'README.md'), 'utf8')) === baseline.get('README.md'), 'Unrelated README.md changed.');

    console.log(JSON.stringify({
      ok: true,
      checks: [
        'invalid-adoption-targets', 'adoption-discovery', 'selective-adoption', 'stale-adoption-preview',
        'exact-prefix-lf-crlf', 'adopted-marker-update', 'latest-first-rollback', 'stale-preview',
        'transaction-create', 'marker-update', 'exact-preimage-rollback', 'private-backup-modes',
        'unselected-tree-preserved',
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
