#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  parseJsonObjectFromOutput,
  summarizeOpsSmokeBatch,
  summarizeStatsPerfDelta,
  validateLifecycleDryRunEvidence,
  validatePlatformSmokeWorkflow,
  validatePostMvpBacklogDocs,
} from './ops-automation-batch-lib.mjs';

const startedAt = new Date().toISOString();
const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-ops-automation-${Date.now()}`);
const baseUrl = process.env.CODEXMUX_OPS_AUTOMATION_URL
  || process.env.CODEXMUX_OPS_SMOKE_RUNTIME_URL
  || 'http://127.0.0.1:8122';
const timeoutMs = Number(process.env.CODEXMUX_OPS_AUTOMATION_TIMEOUT_MS || 60_000);

const row = ({ item, name, status, checks = [], failures = [], ...rest }) => ({
  item,
  name,
  status,
  checks,
  failures,
  ...rest,
});

const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

const runProcess = (command, args, env = {}) => new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const started = Date.now();
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('exit', (code) => {
    resolve({
      ok: code === 0,
      exitCode: code,
      durationMs: Date.now() - started,
      stdout,
      stderr,
    });
  });
  child.on('error', (err) => {
    resolve({
      ok: false,
      exitCode: null,
      durationMs: Date.now() - started,
      stdout,
      stderr: errorMessage(err),
    });
  });
});

const runCorepack = (args, env = {}) => runProcess('corepack', ['pnpm', ...args], env);

const readToken = async () => {
  const fromEnv = process.env.CODEXMUX_TOKEN || process.env.CMUX_TOKEN;
  if (fromEnv?.trim()) return fromEnv.trim();
  const tokenPath = path.join(os.homedir(), '.codexmux', 'cli-token');
  return fs.readFile(tokenPath, 'utf-8').then((value) => value.trim()).catch(() => '');
};

const requestJson = async (pathname, token) => {
  const res = await fetch(new URL(pathname, baseUrl), {
    headers: token ? { 'x-cmux-token': token } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} failed with ${res.status}`);
  return text ? JSON.parse(text) : null;
};

const requestOk = async (pathname, token) => {
  const res = await fetch(new URL(pathname, baseUrl), {
    headers: token ? { 'x-cmux-token': token } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`${pathname} failed with ${res.status}`);
  return true;
};

const runReleaseArtifactRow = async () => {
  try {
    const workflowText = await fs.readFile('.github/workflows/platform-smoke-artifacts.yml', 'utf-8');
    const result = validatePlatformSmokeWorkflow(workflowText);
    return row({
      item: 1,
      name: 'release-ci-artifacts',
      status: result.ok ? 'passed' : 'failed',
      checks: result.checks,
      failures: result.failures,
    });
  } catch (err) {
    return row({
      item: 1,
      name: 'release-ci-artifacts',
      status: 'failed',
      failures: [errorMessage(err)],
    });
  }
};

const runPerfRow = async () => {
  const token = await readToken();
  if (!token) {
    return row({
      item: 2,
      name: 'perf-tuning-snapshot',
      status: 'manual-required',
      failures: [],
      reason: 'local cli token not available',
    });
  }

  try {
    const before = await requestJson('/api/debug/perf', token);
    await Promise.all([
      requestOk('/api/stats/projects?period=7d', token),
      requestOk('/api/stats/sessions?period=7d', token),
    ]);
    const after = await requestJson('/api/debug/perf', token);
    const summary = summarizeStatsPerfDelta({ before, after });
    return row({
      item: 2,
      name: 'perf-tuning-snapshot',
      status: summary.ok ? 'passed' : 'failed',
      checks: summary.ok ? ['debug-perf', 'stats-projects-7d', 'stats-sessions-7d'] : [],
      failures: summary.failures,
      timingKeys: summary.timingKeys,
      counterDeltas: summary.counterDeltas,
    });
  } catch (err) {
    return row({
      item: 2,
      name: 'perf-tuning-snapshot',
      status: 'failed',
      failures: [errorMessage(err)],
    });
  }
};

const runApprovalRow = async () => {
  const result = await runCorepack([
    'test',
    'tests/unit/lib/approval-queue.test.ts',
    'tests/unit/lib/runtime/ipc.test.ts',
    'tests/unit/lib/runtime/status-worker-service.test.ts',
  ]);
  return row({
    item: 3,
    name: 'approval-queue-follow-up',
    status: result.ok ? 'passed' : 'failed',
    checks: result.ok ? ['approval-queue-tests'] : [],
    failures: result.ok ? [] : ['approval-queue-tests-failed'],
    durationMs: result.durationMs,
    exitCode: result.exitCode,
  });
};

const runLifecycleRow = async () => {
  const syntaxResults = await Promise.all([
    runProcess(process.execPath, ['--check', 'scripts/lifecycle-rollback-dry-run-lib.mjs']),
    runProcess(process.execPath, ['--check', 'scripts/lifecycle-rollback-dry-run.mjs']),
  ]);
  const syntaxFailed = syntaxResults.some((result) => !result.ok);
  if (syntaxFailed) {
    return row({
      item: 4,
      name: 'lifecycle-control-follow-up',
      status: 'failed',
      failures: ['lifecycle-dry-run-syntax-failed'],
    });
  }

  const dryRun = await runCorepack(['lifecycle:rollback-dry-run']);
  if (!dryRun.ok) {
    return row({
      item: 4,
      name: 'lifecycle-control-follow-up',
      status: 'failed',
      failures: ['lifecycle-rollback-dry-run-failed'],
      exitCode: dryRun.exitCode,
    });
  }

  const evidence = parseJsonObjectFromOutput(dryRun.stdout);
  const result = validateLifecycleDryRunEvidence(evidence);
  return row({
    item: 4,
    name: 'lifecycle-control-follow-up',
    status: result.ok ? 'passed' : 'failed',
    checks: ['lifecycle-dry-run-syntax', ...result.checks],
    failures: result.failures,
    dropInExists: evidence?.dropInExists ?? null,
    mutates: evidence?.mutates ?? null,
  });
};

const runLongExternalSmokeRow = async () => {
  const result = await runCorepack(['smoke:ops:batch'], {
    CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot,
    CODEXMUX_OPS_SMOKE_PWA_URL: process.env.CODEXMUX_OPS_SMOKE_PWA_URL || baseUrl,
    CODEXMUX_OPS_SMOKE_RUNTIME_URL: process.env.CODEXMUX_OPS_SMOKE_RUNTIME_URL || baseUrl,
  });
  if (!result.ok) {
    return row({
      item: 5,
      name: 'long-external-smoke-evidence',
      status: 'failed',
      failures: ['ops-smoke-batch-failed'],
      durationMs: result.durationMs,
      exitCode: result.exitCode,
    });
  }

  const payload = parseJsonObjectFromOutput(result.stdout);
  const summary = summarizeOpsSmokeBatch(payload);
  return row({
    item: 5,
    name: 'long-external-smoke-evidence',
    status: summary.ok ? 'passed' : 'failed',
    checks: summary.checks,
    failures: summary.failures,
    manualRequired: summary.manualRequired,
    durationMs: result.durationMs,
  });
};

const runPostMvpRow = async () => {
  try {
    const [followUpText, specText] = await Promise.all([
      fs.readFile('docs/FOLLOW-UP.md', 'utf-8'),
      fs.readFile('docs/superpowers/specs/2026-05-06-ops-automation-batch-design.md', 'utf-8'),
    ]);
    const result = validatePostMvpBacklogDocs({ followUpText, specText });
    return row({
      item: 6,
      name: 'post-mvp-backlog-grooming',
      status: result.ok ? 'passed' : 'failed',
      checks: result.checks,
      failures: result.failures,
    });
  } catch (err) {
    return row({
      item: 6,
      name: 'post-mvp-backlog-grooming',
      status: 'failed',
      failures: [errorMessage(err)],
    });
  }
};

const main = async () => {
  await fs.mkdir(artifactRoot, { recursive: true });
  const rows = [];
  rows.push(await runReleaseArtifactRow());
  rows.push(await runPerfRow());
  rows.push(await runApprovalRow());
  rows.push(await runLifecycleRow());
  rows.push(await runLongExternalSmokeRow());
  rows.push(await runPostMvpRow());

  const failed = rows.some((item) => item.status === 'failed');
  const payload = {
    ok: !failed,
    artifactRoot,
    baseUrl,
    rows,
  };

  await writeSmokeArtifact({
    smokeName: 'ops-automation-batch',
    status: failed ? 'failed' : 'passed',
    startedAt,
    payload,
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot },
  });

  console.log(JSON.stringify(payload, null, 2));
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'ops-automation-batch-failed',
    message: errorMessage(err),
  }, null, 2));
  process.exit(1);
});
