#!/usr/bin/env node
import os from 'os';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  buildBacklogCompletionGate,
  readCompletionEvidence,
} from './ops-backlog-completion-gate-lib.mjs';

const startedAt = new Date().toISOString();
const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-backlog-completion-${Date.now()}`);
const manifestPath = process.env.CODEXMUX_BACKLOG_COMPLETION_MANIFEST || '';
const dryRun = process.env.CODEXMUX_BACKLOG_COMPLETION_DRY_RUN === '1';

const errorMessage = (err) => (err instanceof Error ? err.message : String(err));
const manifestReference = (value) => {
  if (!value) return null;
  return path.isAbsolute(value) ? '[external-manifest]' : value;
};

const main = async () => {
  const evidence = await readCompletionEvidence({ artifactRoot, manifestPath });
  const gate = buildBacklogCompletionGate({
    ...evidence,
    generatedAt: startedAt,
  });
  const payload = {
    ...gate,
    artifactRoot,
    dryRun,
    manifestPath: manifestReference(manifestPath),
  };

  await writeSmokeArtifact({
    smokeName: 'ops-backlog-completion-gate',
    status: payload.closable ? 'passed' : 'failed',
    startedAt,
    payload,
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot },
  });

  console.log(JSON.stringify(payload, null, 2));
  process.exit(payload.closable ? 0 : 1);
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'ops-backlog-completion-gate-failed',
    message: errorMessage(err),
  }, null, 2));
  process.exit(1);
});
