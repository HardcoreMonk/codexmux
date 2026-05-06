#!/usr/bin/env node
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-backlog-complete-${Date.now()}`);
const manifestPath = process.env.CODEXMUX_BACKLOG_COMPLETION_MANIFEST_OUT
  || path.join(artifactRoot, 'backlog-completion-manifest.json');
const skipBatchRun = process.env.CODEXMUX_BACKLOG_COMPLETE_SKIP_BATCH_RUN === '1';

const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

const runPnpm = (args, env = {}) => new Promise((resolve) => {
  const started = Date.now();
  const child = spawn('corepack', ['pnpm', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot,
      ...env,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (code) => {
    resolve({
      args,
      status: code === 0 ? 'passed' : 'failed',
      exitCode: code,
      durationMs: Date.now() - started,
    });
  });
  child.on('error', (err) => {
    resolve({
      args,
      status: 'failed',
      exitCode: null,
      durationMs: Date.now() - started,
      error: errorMessage(err),
    });
  });
});

const main = async () => {
  const results = [];

  if (!skipBatchRun) {
    const result = await runPnpm(['ops:backlog:batch-run']);
    results.push(result);
    if (result.status !== 'passed') process.exit(result.exitCode ?? 1);
  }

  const manifest = await runPnpm(['ops:backlog:completion-manifest'], {
    CODEXMUX_BACKLOG_COMPLETION_MANIFEST_OUT: manifestPath,
  });
  results.push(manifest);
  if (manifest.status !== 'passed') process.exit(manifest.exitCode ?? 1);

  const gate = await runPnpm(['ops:backlog:completion-gate'], {
    CODEXMUX_BACKLOG_COMPLETION_MANIFEST: manifestPath,
  });
  results.push(gate);

  console.log(JSON.stringify({
    ok: gate.status === 'passed',
    artifactRoot,
    manifestPath,
    skipBatchRun,
    results,
  }, null, 2));
  process.exit(gate.status === 'passed' ? 0 : (gate.exitCode ?? 1));
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'ops-backlog-complete-failed',
    message: errorMessage(err),
  }, null, 2));
  process.exit(1);
});
