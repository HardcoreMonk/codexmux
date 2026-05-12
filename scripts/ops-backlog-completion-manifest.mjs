#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { validateCompletionManifest } from './ops-backlog-completion-gate-lib.mjs';
import { buildBacklogCompletionManifest } from './ops-backlog-completion-manifest-lib.mjs';

const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-backlog-completion-manifest-${Date.now()}`);
const outputPath = process.env.CODEXMUX_BACKLOG_COMPLETION_MANIFEST_OUT
  || path.join(artifactRoot, 'backlog-completion-manifest.json');
const allowDeferred = process.env.CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER === '1';
const owner = process.env.CODEXMUX_BACKLOG_COMPLETION_OWNER || 'ops';
const revisitTrigger = process.env.CODEXMUX_BACKLOG_COMPLETION_REVISIT_TRIGGER || 'before next release candidate';
const generatedAt = new Date().toISOString();

const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

const main = async () => {
  const manifest = buildBacklogCompletionManifest({
    allowDeferred,
    generatedAt,
    owner,
    revisitTrigger,
  });
  const validation = validateCompletionManifest(manifest);
  if (!validation.ok) {
    console.error(JSON.stringify({
      ok: false,
      code: 'completion-manifest-invalid',
      validation,
    }, null, 2));
    process.exit(1);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  const payload = {
    ok: true,
    outputPath,
    allowDeferred,
    owner,
    entryCount: manifest.entries.length,
    validation,
  };
  console.log(JSON.stringify(payload, null, 2));
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'completion-manifest-failed',
    message: errorMessage(err),
  }, null, 2));
  process.exit(1);
});
