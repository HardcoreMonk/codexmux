#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import {
  buildWindowsUpdateMetadataArtifactPayload,
  collectWindowsReleaseFiles,
  evaluateWindowsUpdateMetadata,
} from './windows-update-metadata-smoke-lib.mjs';

const rootDir = process.cwd();
const releaseDir = path.resolve(process.env.CODEXMUX_WINDOWS_RELEASE_DIR || path.join(rootDir, 'release'));
const latestPath = path.join(releaseDir, 'latest.yml');
const appUpdatePath = path.join(releaseDir, 'win-unpacked', 'resources', 'app-update.yml');
const builderConfigPath = path.join(rootDir, 'electron-builder.yml');
const SMOKE_NAME = 'windows-update-metadata';
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
  try {
    if (!fs.existsSync(latestPath)) {
      await fail('windows-update-latest-yml-missing', 'release/latest.yml was not found.', {
        releaseFileCount: collectWindowsReleaseFiles(releaseDir).length,
      });
    }

    const latestMetadata = yaml.load(fs.readFileSync(latestPath, 'utf8'));
    const appUpdateMetadata = fs.existsSync(appUpdatePath)
      ? yaml.load(fs.readFileSync(appUpdatePath, 'utf8'))
      : null;
    const builderConfig = fs.existsSync(builderConfigPath)
      ? yaml.load(fs.readFileSync(builderConfigPath, 'utf8'))
      : null;
    const result = evaluateWindowsUpdateMetadata({
      latestMetadata,
      appUpdateMetadata,
      publishConfig: builderConfig?.publish,
      releaseFiles: collectWindowsReleaseFiles(releaseDir),
    });
    const payload = buildWindowsUpdateMetadataArtifactPayload(result);

    await writeArtifact(result.ok ? 'passed' : 'failed', payload);
    console.log(JSON.stringify(payload, null, 2));
    if (!result.ok) process.exit(1);
  } catch (err) {
    await fail('windows-update-metadata-smoke-failed', err instanceof Error ? err.message : String(err));
  }
};

main();
