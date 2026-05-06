#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {
  getWindowsReleaseGateSteps,
  runWindowsReleaseGate,
  validateWindowsReleaseGatePackageScripts,
} from './windows-release-gate-lib.mjs';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scriptValidation = validateWindowsReleaseGatePackageScripts({
  scripts: packageJson.scripts,
});

if (!scriptValidation.ok) {
  console.error(JSON.stringify({
    ok: false,
    code: 'windows-release-gate-scripts-missing',
    missingScriptIds: scriptValidation.missingScriptIds,
  }, null, 2));
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'Windows release gate only runs on win32.',
    steps: getWindowsReleaseGateSteps().map((step) => ({
      id: step.id,
      script: step.script,
    })),
  }, null, 2));
  process.exit(0);
}

const startedAt = Date.now();
const result = await runWindowsReleaseGate();
const output = {
  ok: result.ok,
  mutatesSystem: false,
  durationMs: Date.now() - startedAt,
  failedStepId: result.failedStepId,
  results: result.results,
};

console.log(JSON.stringify(output, null, 2));

if (!result.ok) process.exit(1);
