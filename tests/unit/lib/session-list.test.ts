import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempHome: string;

const jsonLine = (value: unknown): string => JSON.stringify(value);

describe('session-list', () => {
  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-session-list-'));
    vi.resetModules();
    vi.stubEnv('HOME', tempHome);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('lists Linux Codex sessions across workspace cwd values', async () => {
    const dir = path.join(tempHome, '.codex', 'sessions', '2026', '04', '27');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      path.join(dir, 'rollout-2026-04-27T01-00-00-019dcf1f-3a02-73a0-a79e-8703b99a2f30.jsonl'),
      [
        jsonLine({
          timestamp: '2026-04-27T01:00:01.000Z',
          type: 'session_meta',
          payload: {
            id: '019dcf1f-3a02-73a0-a79e-8703b99a2f30',
            timestamp: '2026-04-27T01:00:00.000Z',
            cwd: '/work/project-a',
          },
        }),
        jsonLine({
          timestamp: '2026-04-27T01:00:02.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'Start Codex work' },
        }),
      ].join('\n'),
    );

    await fs.writeFile(
      path.join(dir, 'rollout-2026-04-27T02-00-00-019dcf20-3a02-73a0-a79e-8703b99a2f31.jsonl'),
      [
        jsonLine({
          timestamp: '2026-04-27T02:00:01.000Z',
          type: 'session_meta',
          payload: {
            id: '019dcf20-3a02-73a0-a79e-8703b99a2f31',
            timestamp: '2026-04-27T02:00:00.000Z',
            cwd: '/work/project-b',
          },
        }),
      ].join('\n'),
    );

    const { listSessions } = await import('@/lib/session-list');
    const sessions = await listSessions('tmux-session', '/work/project-a', 'codex');
    const projectA = sessions.find((session) => session.sessionId === '019dcf1f-3a02-73a0-a79e-8703b99a2f30');
    const projectB = sessions.find((session) => session.sessionId === '019dcf20-3a02-73a0-a79e-8703b99a2f31');

    expect(sessions).toHaveLength(2);
    expect(projectA).toMatchObject({
      sessionId: '019dcf1f-3a02-73a0-a79e-8703b99a2f30',
      startedAt: '2026-04-27T01:00:00.000Z',
      firstMessage: 'Start Codex work',
      turnCount: 1,
      source: 'local',
      cwd: '/work/project-a',
    });
    expect(projectB).toMatchObject({
      sessionId: '019dcf20-3a02-73a0-a79e-8703b99a2f31',
      source: 'local',
      cwd: '/work/project-b',
    });
  });

  it('returns paginated session list pages from the index', async () => {
    const dir = path.join(tempHome, '.codex', 'sessions', '2026', '04', '28');
    await fs.mkdir(dir, { recursive: true });

    const sessions = [
      {
        id: '019dd010-3a02-73a0-a79e-8703b99a2f30',
        message: 'Oldest work',
        startedAt: '2026-04-28T01:00:00.000Z',
        mtime: '2026-04-28T01:10:00.000Z',
      },
      {
        id: '019dd011-3a02-73a0-a79e-8703b99a2f31',
        message: 'Middle work',
        startedAt: '2026-04-28T02:00:00.000Z',
        mtime: '2026-04-28T02:10:00.000Z',
      },
      {
        id: '019dd012-3a02-73a0-a79e-8703b99a2f32',
        message: 'Newest work',
        startedAt: '2026-04-28T03:00:00.000Z',
        mtime: '2026-04-28T03:10:00.000Z',
      },
    ];

    for (const session of sessions) {
      const filePath = path.join(dir, `rollout-${session.id}.jsonl`);
      await fs.writeFile(
        filePath,
        [
          jsonLine({
            timestamp: session.startedAt,
            type: 'session_meta',
            payload: {
              id: session.id,
              timestamp: session.startedAt,
              cwd: '/work/project',
            },
          }),
          jsonLine({
            timestamp: session.mtime,
            type: 'event_msg',
            payload: { type: 'user_message', message: session.message },
          }),
        ].join('\n'),
      );
      const mtime = new Date(session.mtime);
      await fs.utimes(filePath, mtime, mtime);
    }

    const { listSessionPage } = await import('@/lib/session-list');
    const page = await listSessionPage('tmux-session', '/work/project', 'codex', { offset: 1, limit: 1 });

    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(page.sessions).toHaveLength(1);
    expect(page.sessions[0]).toMatchObject({
      sessionId: '019dd011-3a02-73a0-a79e-8703b99a2f31',
      firstMessage: 'Middle work',
    });
  });

  it('includes remote Windows Codex sessions without Linux cwd filtering', async () => {
    const { writeRemoteCodexChunk } = await import('@/lib/remote-codex-store');
    const content = [
      jsonLine({
        timestamp: '2026-04-27T03:00:01.000Z',
        type: 'session_meta',
        payload: {
          id: '019dcf30-3a02-73a0-a79e-8703b99a2f32',
          timestamp: '2026-04-27T03:00:00.000Z',
          cwd: 'C:\\Users\\monk\\project',
        },
      }),
      jsonLine({
        timestamp: '2026-04-27T03:00:02.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Windows pwsh work' },
      }),
    ].join('\n');

    const result = await writeRemoteCodexChunk({
      sourceId: 'win11',
      host: 'WIN11',
      shell: 'pwsh',
      cwd: 'C:\\Users\\monk\\project',
      windowsPath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf30-3a02-73a0-a79e-8703b99a2f32.jsonl',
      sessionId: '019dcf30-3a02-73a0-a79e-8703b99a2f32',
      startedAt: '2026-04-27T03:00:00.000Z',
      mtimeMs: new Date('2026-04-27T03:00:02.000Z').getTime(),
      offset: 0,
      reset: true,
      content: Buffer.from(content),
    });

    const { listSessions } = await import('@/lib/session-list');
    const sessions = await listSessions('tmux-session', '/work/project-a', 'codex');

    expect(result.jsonlPath).toContain('019dcf30-3a02-73a0-a79e-8703b99a2f32');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: '019dcf30-3a02-73a0-a79e-8703b99a2f32',
      firstMessage: 'Windows pwsh work',
      turnCount: 1,
      source: 'remote',
      sourceId: 'win11',
      sourceLabel: 'WIN11 / pwsh',
      cwd: 'C:\\Users\\monk\\project',
      remotePath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf30-3a02-73a0-a79e-8703b99a2f32.jsonl',
    });
  });

  it('uses remote sidecar metadata without parsing the JSONL body for session lists', async () => {
    const { writeRemoteCodexChunk } = await import('@/lib/remote-codex-store');
    const content = [
      jsonLine({
        timestamp: '2026-04-27T04:00:01.000Z',
        type: 'session_meta',
        payload: {
          id: '019dcf40-3a02-73a0-a79e-8703b99a2f33',
          timestamp: '2026-04-27T04:00:00.000Z',
          cwd: 'C:\\Users\\monk\\large-project',
        },
      }),
      jsonLine({
        timestamp: '2026-04-27T04:00:02.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Cached remote preview' },
      }),
    ].join('\n');

    const result = await writeRemoteCodexChunk({
      sourceId: 'win11',
      host: 'WIN11',
      shell: 'pwsh',
      cwd: 'C:\\Users\\monk\\large-project',
      windowsPath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf40-3a02-73a0-a79e-8703b99a2f33.jsonl',
      sessionId: '019dcf40-3a02-73a0-a79e-8703b99a2f33',
      startedAt: '2026-04-27T04:00:00.000Z',
      mtimeMs: new Date('2026-04-27T04:00:02.000Z').getTime(),
      offset: 0,
      reset: true,
      content: Buffer.from(content),
    });
    await fs.writeFile(result.jsonlPath, '{not-json}\n');

    const { listSessions } = await import('@/lib/session-list');
    const sessions = await listSessions('tmux-session', '/work/project-a', 'codex');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: '019dcf40-3a02-73a0-a79e-8703b99a2f33',
      firstMessage: 'Cached remote preview',
      turnCount: 1,
      source: 'remote',
      sourceLabel: 'WIN11 / pwsh',
    });
  });

  it('filters session list pages by source and remote source id', async () => {
    await fs.mkdir(path.join(tempHome, '.codex', 'sessions', '2026', '04', '27'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.codex', 'sessions', '2026', '04', '27', 'rollout-2026-04-27T01-00-00-019dcf50-3a02-73a0-a79e-8703b99a2f34.jsonl'),
      [
        jsonLine({
          timestamp: '2026-04-27T01:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: '019dcf50-3a02-73a0-a79e-8703b99a2f34',
            timestamp: '2026-04-27T01:00:00.000Z',
            cwd: '/work/project',
          },
        }),
      ].join('\n'),
    );

    const { writeRemoteCodexChunk } = await import('@/lib/remote-codex-store');
    const buildRemoteContent = (id: string, message: string) => Buffer.from([
      jsonLine({
        timestamp: '2026-04-27T05:00:01.000Z',
        type: 'session_meta',
        payload: {
          id,
          timestamp: '2026-04-27T05:00:00.000Z',
          cwd: 'C:\\Users\\monk\\project',
        },
      }),
      jsonLine({
        timestamp: '2026-04-27T05:00:02.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message },
      }),
    ].join('\n'));

    await writeRemoteCodexChunk({
      sourceId: 'win11-a',
      host: 'WIN-A',
      shell: 'pwsh',
      cwd: 'C:\\Users\\monk\\project',
      windowsPath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf51-3a02-73a0-a79e-8703b99a2f35.jsonl',
      sessionId: '019dcf51-3a02-73a0-a79e-8703b99a2f35',
      startedAt: '2026-04-27T05:00:00.000Z',
      mtimeMs: new Date('2026-04-27T05:00:02.000Z').getTime(),
      offset: 0,
      reset: true,
      content: buildRemoteContent('019dcf51-3a02-73a0-a79e-8703b99a2f35', 'Windows A work'),
    });
    await writeRemoteCodexChunk({
      sourceId: 'win11-b',
      host: 'WIN-B',
      shell: 'pwsh',
      cwd: 'C:\\Users\\monk\\project',
      windowsPath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf52-3a02-73a0-a79e-8703b99a2f36.jsonl',
      sessionId: '019dcf52-3a02-73a0-a79e-8703b99a2f36',
      startedAt: '2026-04-27T05:01:00.000Z',
      mtimeMs: new Date('2026-04-27T05:01:02.000Z').getTime(),
      offset: 0,
      reset: true,
      content: buildRemoteContent('019dcf52-3a02-73a0-a79e-8703b99a2f36', 'Windows B work'),
    });

    const { listSessionPage } = await import('@/lib/session-list');
    const remotePage = await listSessionPage('tmux-session', '/work/project', 'codex', { source: 'remote' });
    const sourcePage = await listSessionPage('tmux-session', '/work/project', 'codex', { source: 'remote', sourceId: 'win11-a' });
    const localPage = await listSessionPage('tmux-session', '/work/project', 'codex', { source: 'local' });

    expect(remotePage.total).toBe(2);
    expect(sourcePage.total).toBe(1);
    expect(sourcePage.sessions[0]).toMatchObject({
      source: 'remote',
      sourceId: 'win11-a',
      firstMessage: 'Windows A work',
    });
    expect(localPage.total).toBe(1);
    expect(localPage.sessions[0]).toMatchObject({ source: 'local' });
  });

  it('summarizes remote Codex sources for UI status', async () => {
    const { writeRemoteCodexChunk, listRemoteCodexSources } = await import('@/lib/remote-codex-store');
    const content = [
      jsonLine({
        timestamp: '2026-04-27T06:00:01.000Z',
        type: 'session_meta',
        payload: {
          id: '019dcf60-3a02-73a0-a79e-8703b99a2f37',
          timestamp: '2026-04-27T06:00:00.000Z',
          cwd: 'C:\\Users\\monk\\project',
        },
      }),
      jsonLine({
        timestamp: '2026-04-27T06:00:02.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Windows source work' },
      }),
    ].join('\n');

    await writeRemoteCodexChunk({
      sourceId: 'win11',
      host: 'WIN11',
      shell: 'pwsh',
      cwd: 'C:\\Users\\monk\\project',
      windowsPath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf60-3a02-73a0-a79e-8703b99a2f37.jsonl',
      sessionId: '019dcf60-3a02-73a0-a79e-8703b99a2f37',
      startedAt: '2026-04-27T06:00:00.000Z',
      mtimeMs: new Date('2026-04-27T06:00:02.000Z').getTime(),
      offset: 0,
      reset: true,
      content: Buffer.from(content),
    });

    const sources = await listRemoteCodexSources();

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      sourceId: 'win11',
      sourceLabel: 'WIN11 / pwsh',
      sessionCount: 1,
      latestCwd: 'C:\\Users\\monk\\project',
      latestRemotePath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf60-3a02-73a0-a79e-8703b99a2f37.jsonl',
    });
    expect(sources[0].totalBytes).toBeGreaterThan(0);
  });
});
