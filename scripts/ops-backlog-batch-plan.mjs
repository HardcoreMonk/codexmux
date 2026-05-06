#!/usr/bin/env node
import os from 'os';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import { buildBacklogBatchPlan } from './ops-backlog-batch-plan-lib.mjs';

const startedAt = new Date().toISOString();
const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-backlog-batch-plan-${Date.now()}`);

const main = async () => {
  const plan = buildBacklogBatchPlan({ generatedAt: startedAt });
  const payload = {
    ...plan,
    artifactRoot,
  };

  await writeSmokeArtifact({
    smokeName: 'ops-backlog-batch-plan',
    status: plan.valid ? 'passed' : 'failed',
    startedAt,
    payload,
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot },
  });

  console.log(JSON.stringify(payload, null, 2));
  process.exit(plan.valid ? 0 : 1);
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'ops-backlog-batch-plan-failed',
    message: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
