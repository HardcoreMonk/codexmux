import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-sync-smoke-lib.mjs')).href);

describe('Windows sync smoke helpers', () => {
  it('builds Windows Codex JSONL fixtures with session metadata and user text', async () => {
    const { buildWindowsCodexSessionJsonl } = await loadLib();

    const jsonl = buildWindowsCodexSessionJsonl({
      sessionId: '019df010-3a02-73a0-a79e-8703b99a2f30',
      cwd: 'C:\\Users\\monk\\project',
      message: 'Windows smoke prompt',
      startedAt: '2026-05-04T01:00:00.000Z',
    });
    const records = jsonl.trim().split('\n').map((line: string) => JSON.parse(line));

    expect(records).toMatchObject([
      {
        type: 'session_meta',
        payload: {
          id: '019df010-3a02-73a0-a79e-8703b99a2f30',
          cwd: 'C:\\Users\\monk\\project',
        },
      },
      {
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message: 'Windows smoke prompt',
        },
      },
    ]);
  });

  it('builds once and dry-run command args for the Windows companion', async () => {
    const { buildWindowsSyncArgs } = await loadLib();

    expect(buildWindowsSyncArgs({
      scriptPath: 'scripts/windows-codex-sync.mjs',
      serverUrl: 'http://127.0.0.1:8122',
      tokenFile: 'C:\\Users\\monk\\.codexmux\\cli-token',
      sourceId: 'win11-smoke',
      shellName: 'pwsh',
      codexDir: 'C:\\Users\\monk\\.codex\\sessions',
      stateFile: 'C:\\Users\\monk\\.codexmux\\state.json',
      dryRun: true,
    })).toEqual([
      'scripts/windows-codex-sync.mjs',
      '--server', 'http://127.0.0.1:8122',
      '--token-file', 'C:\\Users\\monk\\.codexmux\\cli-token',
      '--source-id', 'win11-smoke',
      '--shell', 'pwsh',
      '--codex-dir', 'C:\\Users\\monk\\.codex\\sessions',
      '--state-file', 'C:\\Users\\monk\\.codexmux\\state.json',
      '--interval-ms', '500',
      '--full-scan-interval-ms', '500',
      '--since-hours', 'all',
      '--once',
      '--dry-run',
    ]);
  });

  it('validates synced source and session smoke results', async () => {
    const { validateWindowsSyncSmokeResult } = await loadLib();

    expect(validateWindowsSyncSmokeResult({
      expected: {
        sourceId: 'win11-smoke',
        sessionId: '019df010-3a02-73a0-a79e-8703b99a2f30',
        message: 'Windows smoke prompt',
        cwd: 'C:\\Users\\monk\\project',
      },
      sources: [
        {
          sourceId: 'win11-smoke',
          sourceLabel: 'WIN11 / pwsh',
          sessionCount: 1,
          latestCwd: 'C:\\Users\\monk\\project',
        },
      ],
      page: {
        total: 1,
        sessions: [
          {
            sessionId: '019df010-3a02-73a0-a79e-8703b99a2f30',
            firstMessage: 'Windows smoke prompt',
            source: 'remote',
            sourceId: 'win11-smoke',
            cwd: 'C:\\Users\\monk\\project',
          },
        ],
      },
    })).toEqual([
      'remote-source-summary',
      'remote-session-list',
      'remote-session-metadata',
    ]);
  });
});
