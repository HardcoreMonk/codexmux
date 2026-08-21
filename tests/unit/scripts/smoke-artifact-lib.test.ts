import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/smoke-artifact-lib.mjs')).href);

describe('smoke artifact helpers', () => {
  it('does not write when CODEXMUX_SMOKE_ARTIFACT_DIR is unset', async () => {
    const { writeSmokeArtifact } = await loadLib();
    const result = await writeSmokeArtifact({
      smokeName: 'browser-reconnect',
      status: 'passed',
      startedAt: '2026-05-05T00:00:00.000Z',
      payload: { ok: true },
      env: {},
    });

    expect(result).toEqual({ skipped: true, path: null });
  });

  it('writes a sanitized artifact when artifact dir is set', async () => {
    const { writeSmokeArtifact } = await loadLib();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-smoke-artifact-test-'));

    const result = await writeSmokeArtifact({
      smokeName: 'android-timeline-foreground',
      status: 'failed',
      startedAt: '2026-05-05T00:00:00.000Z',
      endedAt: '2026-05-05T00:00:03.000Z',
      payload: {
        ok: false,
        code: 'android-failed',
        homeDir: '/tmp/codexmux-android-timeline-foreground-secret',
        serverOutput: 'prompt body should not survive',
        sessionName: 'pt-secret-session',
        targetUrl: 'http://100.64.0.1:12345',
        browser: { pageUrl: 'http://127.0.0.1:12345/', consoleEventCount: 1 },
        checks: ['android-bridge'],
        nested: {
          jsonlPath: '/home/me/.codex/sessions/2026/05/05/secret.jsonl',
          note: '/home/me/.codex/sessions/2026/05/05/secret.jsonl',
          message: 'secret-android-timeline-user-1',
        },
      },
      env: { CODEXMUX_SMOKE_ARTIFACT_DIR: dir },
    });

    expect(result.skipped).toBe(false);
    expect(result.path).toMatch(/android-timeline-foreground-20260505T000003000Z-failed\.json$/);

    const artifact = JSON.parse(await fs.readFile(result.path, 'utf-8'));
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      smokeName: 'android-timeline-foreground',
      status: 'failed',
      durationMs: 3000,
      payload: {
        ok: false,
        code: 'android-failed',
        checks: ['android-bridge'],
        browser: { consoleEventCount: 1 },
        nested: {
          note: '[codex-session-path]',
        },
      },
    });
    expect(artifact.payload).not.toHaveProperty('sessionName');
    expect(artifact.payload).not.toHaveProperty('targetUrl');
    expect(artifact.payload.browser).not.toHaveProperty('pageUrl');
    expect(artifact.payload.nested).not.toHaveProperty('jsonlPath');
    expect(artifact.payload.nested).not.toHaveProperty('message');
    expect(JSON.stringify(artifact)).not.toContain('prompt body');
    expect(JSON.stringify(artifact)).not.toContain('codexmux-android-timeline-foreground-secret');
    expect(JSON.stringify(artifact)).not.toContain('secret.jsonl');
  });

  it('builds stable artifact filenames from endedAt', async () => {
    const { buildSmokeArtifactFilename } = await loadLib();

    expect(buildSmokeArtifactFilename({
      smokeName: 'browser-reconnect',
      status: 'passed',
      endedAt: '2026-05-05T01:02:03.456Z',
    })).toBe('browser-reconnect-20260505T010203456Z-passed.json');
  });

  it('drops terminal output tails and sanitizes Windows temp smoke paths', async () => {
    const { sanitizeSmokeArtifactPayload } = await loadLib();
    const payload = sanitizeSmokeArtifactPayload({
      ok: true,
      outputTail: 'cmux marker and terminal escape output should not survive',
      note: 'C:\\Users\\yohan\\AppData\\Local\\Temp\\codexmux-windows-terminal-smoke-abcd\\runtime-v2\\state.db',
      nested: {
        message: 'C:\\Users\\yohan\\AppData\\Local\\Temp\\codexmux-windows-codex-session-efgh\\.codex\\sessions\\2026\\05\\06\\secret.jsonl',
      },
    });

    expect(payload).toEqual({
      ok: true,
      note: '[tmp]',
      nested: {},
    });
    expect(JSON.stringify(payload)).not.toContain('terminal escape output');
    expect(JSON.stringify(payload)).not.toContain('codexmux-windows-terminal-smoke');
    expect(JSON.stringify(payload)).not.toContain('secret.jsonl');
  });

  it('drops nested child output tail fields', async () => {
    const { sanitizeSmokeArtifactPayload } = await loadLib();
    const payload = sanitizeSmokeArtifactPayload({
      ok: true,
      installResult: {
        exitCode: 0,
        stdoutTail: 'downloaded to C:\\Users\\runner\\AppData\\Local\\Temp\\cmux-up-secret\\payload.exe',
        stderrTail: 'DevTools listening on ws://127.0.0.1:12345',
      },
    });

    expect(payload).toEqual({
      ok: true,
      installResult: {
        exitCode: 0,
      },
    });
  });

  it('drops nested URL fields and sanitizes cmux Windows temp paths', async () => {
    const { sanitizeSmokeArtifactPayload } = await loadLib();
    const payload = sanitizeSmokeArtifactPayload({
      ok: true,
      latestReleaseUrl: 'https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.20',
      nested: {
        downloadUri: 'https://example.com/private-target',
        href: 'http://127.0.0.1:8122/login',
        origin: 'http://127.0.0.1:8122',
        note: 'C:\\Users\\runner\\AppData\\Local\\Temp\\cmux-up-secret\\updater-home',
      },
    });

    expect(payload).toEqual({
      ok: true,
      nested: {
        note: '[tmp]',
      },
    });
  });

  it('reports artifact privacy violations before upload', async () => {
    const { findSmokeArtifactPrivacyViolations } = await loadLib();

    expect(findSmokeArtifactPrivacyViolations).toBeTypeOf('function');
    if (typeof findSmokeArtifactPrivacyViolations !== 'function') return;

    expect(findSmokeArtifactPrivacyViolations({
      payload: {
        stdoutTail: 'raw terminal output',
        latestReleaseUrl: 'https://example.com/releases/v1',
        note: 'C:\\Users\\runner\\AppData\\Local\\Temp\\cmux-up-secret\\home',
        blockers: ['https://example.com/private-blocker'],
        checks: ['C:\\Users\\runner\\AppData\\Local\\Temp\\cmux-up-check\\home'],
      },
    })).toEqual([
      '$.payload.stdoutTail:forbidden-key',
      '$.payload.latestReleaseUrl:forbidden-key',
      '$.payload.latestReleaseUrl:url',
      '$.payload.note:temp-path',
      '$.payload.blockers[0]:url',
      '$.payload.checks[0]:temp-path',
    ]);

    expect(findSmokeArtifactPrivacyViolations({
      payload: {
        ok: true,
        code: 'passed',
        checks: ['package-gate'],
      },
    })).toEqual([]);
    expect(findSmokeArtifactPrivacyViolations('https://example.com/private-root')).toEqual(['$:url']);
  });

  it('fails the artifact check command without echoing private values', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-smoke-artifact-check-'));
    await fs.writeFile(path.join(dir, 'clean.json'), JSON.stringify({ payload: { ok: true } }));

    const clean = spawnSync(process.execPath, ['scripts/check-smoke-artifacts.mjs', '--', dir], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(clean.status).toBe(0);

    const privateValue = 'https://example.com/private-target';
    await fs.writeFile(path.join(dir, 'dirty.json'), JSON.stringify({ payload: { targetUrl: privateValue } }));
    const dirty = spawnSync(process.execPath, ['scripts/check-smoke-artifacts.mjs', '--', dir], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain('smoke-artifact-privacy-violation');
    expect(dirty.stderr).not.toContain(privateValue);
  });
});
