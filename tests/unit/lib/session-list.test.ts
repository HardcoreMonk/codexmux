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
      cwd: '/work/project-a',
    });
    expect(projectB).toMatchObject({
      sessionId: '019dcf20-3a02-73a0-a79e-8703b99a2f31',
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

});
