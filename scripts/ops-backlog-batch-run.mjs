#!/usr/bin/env node
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  buildBacklogBatchRunPlan,
  parseCorepackPnpmCommand,
  summarizeBatchRunResults,
} from './ops-backlog-batch-run-lib.mjs';

const startedAt = new Date().toISOString();
const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-backlog-batch-run-${Date.now()}`);
const includeConditional = process.env.CODEXMUX_BACKLOG_BATCH_INCLUDE_CONDITIONAL === '1';
const continueOnFailure = process.env.CODEXMUX_BACKLOG_BATCH_CONTINUE_ON_FAILURE === '1';
const dryRun = process.env.CODEXMUX_BACKLOG_BATCH_DRY_RUN === '1';

const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

const runCorepackPnpm = (command) => new Promise((resolve) => {
  let args;
  try {
    args = parseCorepackPnpmCommand(command);
  } catch (err) {
    resolve({
      command,
      status: 'failed',
      exitCode: null,
      durationMs: 0,
      error: errorMessage(err),
    });
    return;
  }

  const started = Date.now();
  const child = spawn('corepack', ['pnpm', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (code) => {
    resolve({
      command,
      status: code === 0 ? 'passed' : 'failed',
      exitCode: code,
      durationMs: Date.now() - started,
    });
  });
  child.on('error', (err) => {
    resolve({
      command,
      status: 'failed',
      exitCode: null,
      durationMs: Date.now() - started,
      error: errorMessage(err),
    });
  });
});

const main = async () => {
  const planned = buildBacklogBatchRunPlan({ includeConditional });
  const results = [];

  if (!dryRun) {
    for (const plannedCommand of planned.commands) {
      const result = await runCorepackPnpm(plannedCommand.command);
      results.push(result);
      if (result.status === 'failed' && !continueOnFailure) break;
    }
  }

  const summary = summarizeBatchRunResults({ planned, results });
  const payload = {
    schemaVersion: 1,
    generatedAt: startedAt,
    artifactRoot,
    dryRun,
    continueOnFailure,
    includeConditional,
    planned,
    results,
    summary,
  };

  await writeSmokeArtifact({
    smokeName: 'ops-backlog-batch-run',
    status: summary.ok ? 'passed' : 'failed',
    startedAt,
    payload,
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot },
  });

  console.log(JSON.stringify(payload, null, 2));
  process.exit(summary.ok ? 0 : 1);
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'ops-backlog-batch-run-failed',
    message: errorMessage(err),
  }, null, 2));
  process.exit(1);
});
