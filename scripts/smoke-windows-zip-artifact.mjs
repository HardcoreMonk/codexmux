#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  evaluateWindowsZipEntries,
  findWindowsZipArtifact,
  readWindowsZipEntries,
} from './windows-zip-smoke-lib.mjs';

const rootDir = process.cwd();
const SMOKE_NAME = 'windows-zip-artifact';
const startedAt = new Date().toISOString();

const writeArtifact = async (status, payload) =>
  writeSmokeArtifact({
    smokeName: SMOKE_NAME,
    status,
    startedAt,
    payload,
  }).catch((err) => {
    console.error(JSON.stringify({
      ok: false,
      code: 'smoke-artifact-write-failed',
      message: err instanceof Error ? err.message : String(err),
    }, null, 2));
  });

const fail = async (code, message, details = {}) => {
  const payload = { ok: false, code, message, mutatesSystem: false, ...details };
  await writeArtifact('failed', payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
};

const main = async () => {
  if (process.platform !== 'win32') {
    await fail('windows-zip-artifact-platform-mismatch', 'Windows zip artifact smoke requires win32.', {
      platform: process.platform,
    });
  }

  const zipPath = path.resolve(
    process.env.CODEXMUX_WINDOWS_ZIP_PATH
    || findWindowsZipArtifact(path.join(rootDir, 'release'))
    || '',
  );

  try {
    if (!zipPath) throw new Error('Windows zip artifact not found under release/.');
    const stat = await fs.stat(zipPath);
    const entries = await readWindowsZipEntries(zipPath);
    const report = evaluateWindowsZipEntries(entries);
    const payload = {
      ok: report.ok,
      mutatesSystem: false,
      zipFileName: path.basename(zipPath),
      zipSizeBytes: stat.size,
      checks: report.checks,
      missingEntryPatterns: report.missingEntryPatterns,
      entryCount: report.entryCount,
    };

    await writeArtifact(report.ok ? 'passed' : 'failed', payload);
    console.log(JSON.stringify(payload, null, 2));
    if (!report.ok) process.exit(1);
  } catch (err) {
    await fail('windows-zip-artifact-smoke-failed', err instanceof Error ? err.message : String(err), {
      zipFileName: zipPath ? path.basename(zipPath) : null,
    });
  }
};

main();
