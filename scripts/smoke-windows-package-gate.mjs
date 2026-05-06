#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  buildWindowsPackageGateArtifactPayload,
  getWindowsPackageGateSteps,
  runWindowsPackageGate,
  validateWindowsPackageGatePackageScripts,
} from './windows-package-gate-lib.mjs';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scriptValidation = validateWindowsPackageGatePackageScripts({
  scripts: packageJson.scripts,
});

if (!scriptValidation.ok) {
  console.error(JSON.stringify({
    ok: false,
    code: 'windows-package-gate-scripts-missing',
    missingScriptIds: scriptValidation.missingScriptIds,
  }, null, 2));
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'Windows package gate only runs on win32.',
    steps: getWindowsPackageGateSteps().map((step) => ({
      id: step.id,
      script: step.script,
    })),
  }, null, 2));
  process.exit(0);
}

const startedAt = new Date().toISOString();
const startedMs = Date.now();
const result = await runWindowsPackageGate();
const endedAt = new Date().toISOString();
const output = buildWindowsPackageGateArtifactPayload({
  result,
  durationMs: Date.now() - startedMs,
});
const artifact = await writeSmokeArtifact({
  smokeName: 'windows-package-gate',
  status: result.ok ? 'passed' : 'failed',
  payload: output,
  startedAt,
  endedAt,
});

console.log(JSON.stringify({
  ...output,
  artifact: {
    written: !artifact.skipped,
  },
}, null, 2));

if (!result.ok) process.exit(1);
