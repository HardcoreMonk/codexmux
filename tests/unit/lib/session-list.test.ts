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

  it('lists Codex sessions from ~/.codex/sessions filtered by cwd', async () => {
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

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: '019dcf1f-3a02-73a0-a79e-8703b99a2f30',
      startedAt: '2026-04-27T01:00:00.000Z',
      firstMessage: 'Start Codex work',
      turnCount: 1,
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
      source: 'remote',
      sourceLabel: 'WIN11 / pwsh',
      cwd: 'C:\\Users\\monk\\project',
      remotePath: 'C:\\Users\\monk\\.codex\\sessions\\rollout-019dcf30-3a02-73a0-a79e-8703b99a2f32.jsonl',
    });
  });
});
