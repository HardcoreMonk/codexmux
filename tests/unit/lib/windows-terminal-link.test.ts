import { describe, expect, it } from 'vitest';
import { getWindowsTerminalLinkTarget } from '@/lib/windows-terminal-link';
import type { IRemoteTerminalStatus } from '@/types/remote-terminal';
import type { IRemoteCodexSourceStatus } from '@/types/timeline';

const terminal = (overrides: Partial<IRemoteTerminalStatus> = {}): IRemoteTerminalStatus => ({
  sourceId: 'win11-main',
  terminalId: 'main',
  sourceLabel: 'AMD_5800X / pwsh',
  host: 'AMD_5800X',
  shell: 'pwsh',
  cwd: 'D:\\data\\codexmux',
  cols: 120,
  rows: 36,
  commandSeq: 0,
  outputSeq: 4,
  pendingCommandCount: 0,
  outputBytes: 335,
  connectedClientCount: 0,
  createdAt: '2026-05-03T18:07:31.269Z',
  lastSeenAt: '2026-05-03T18:08:11.017Z',
  lastCommandAt: null,
  lastOutputAt: '2026-05-03T18:07:31.834Z',
  ...overrides,
});

const remoteSource = (overrides: Partial<IRemoteCodexSourceStatus> = {}): IRemoteCodexSourceStatus => {
  const base: IRemoteCodexSourceStatus = {
    sourceId: 'win11-sync',
    sourceLabel: 'WIN11 / pwsh',
    host: 'WIN11',
    shell: 'pwsh',
    sessionCount: 1,
    latestActivityAt: '2026-05-03T18:00:00.000Z',
    latestSyncAt: '2026-05-03T18:00:00.000Z',
    latestCwd: 'D:\\data\\codexmux',
    latestRemotePath: 'D:\\data\\codexmux\\.codex\\sessions\\session.jsonl',
    totalBytes: 1024,
  };
  return { ...base, ...overrides };
};

describe('getWindowsTerminalLinkTarget', () => {
  it('uses a registered terminal bridge source even when no Windows sync source exists', () => {
    expect(getWindowsTerminalLinkTarget({
      remoteSources: [],
      remoteTerminals: [terminal()],
    })).toEqual({
      sourceId: 'win11-main',
      terminalId: 'main',
      href: '/windows-terminal?sourceId=win11-main&terminalId=main',
    });
  });

  it('falls back to the Windows sync source when terminal bridge state has not loaded', () => {
    expect(getWindowsTerminalLinkTarget({
      remoteSources: [remoteSource()],
      remoteTerminals: [],
    })).toEqual({
      sourceId: 'win11-sync',
      terminalId: null,
      href: '/windows-terminal?sourceId=win11-sync',
    });
  });
});
