#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { findSmokeArtifactPrivacyViolations } from './smoke-artifact-lib.mjs';

const targets = process.argv.slice(2).filter((arg) => arg !== '--');

const listJsonFiles = async (target) => {
  const stat = await fs.stat(target);
  if (stat.isFile()) return target.endsWith('.json') ? [target] : [];

  const entries = await fs.readdir(target, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(target, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  }));
  return files.flat();
};

if (targets.length === 0) {
  console.error(JSON.stringify({ ok: false, code: 'smoke-artifact-target-required' }));
  process.exit(1);
}

const files = (await Promise.all(targets.map((target) => listJsonFiles(path.resolve(target))))).flat();
if (files.length === 0) {
  console.error(JSON.stringify({ ok: false, code: 'smoke-artifact-json-required' }));
  process.exit(1);
}

const failures = [];
for (const file of files) {
  try {
    const artifact = JSON.parse(await fs.readFile(file, 'utf8'));
    const violations = findSmokeArtifactPrivacyViolations(artifact);
    if (violations.length > 0) failures.push({ file: path.basename(file), violations });
  } catch {
    failures.push({ file: path.basename(file), violations: ['$:invalid-json'] });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    code: 'smoke-artifact-privacy-violation',
    fileCount: files.length,
    failures,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, fileCount: files.length }));
