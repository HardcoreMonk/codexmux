import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempHome: string;

const jsonLine = (value: unknown): string => JSON.stringify(value);

const writeSession = async (message = 'Start work'): Promise<string> => {
  const dir = path.join(tempHome, '.codex', 'sessions', '2026', '05', '02');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'rollout-2026-05-02T01-00-00-019dd001-3a02-73a0-a79e-8703b99a2f30.jsonl');
  await fs.writeFile(
    filePath,
    [
      jsonLine({
        timestamp: '2026-05-02T01:00:01.000Z',
        type: 'session_meta',
        payload: {
          id: '019dd001-3a02-73a0-a79e-8703b99a2f30',
          timestamp: '2026-05-02T01:00:00.000Z',
          cwd: '/work/project',
        },
      }),
      jsonLine({
        timestamp: '2026-05-02T01:00:02.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message },
      }),
    ].join('\n'),
  );
  return filePath;
};

describe('session-index', () => {
  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-session-index-'));
    vi.resetModules();
    vi.stubEnv('HOME', tempHome);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('skips persisted index writes when refresh output is unchanged', async () => {
    const jsonlPath = await writeSession();
    const { refreshSessionIndex, getSessionIndexPerfSnapshot } = await import('@/lib/session-index');

    await refreshSessionIndex();
    expect(getSessionIndexPerfSnapshot()).toMatchObject({
      sessions: 1,
      persistWrites: 1,
      persistSkips: 0,
    });

    await refreshSessionIndex();
    expect(getSessionIndexPerfSnapshot()).toMatchObject({
      sessions: 1,
      persistWrites: 1,
      persistSkips: 1,
    });

    await fs.appendFile(
      jsonlPath,
      `\n${jsonLine({
        timestamp: '2026-05-02T01:01:00.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Continue work' },
      })}`,
    );

    await refreshSessionIndex();
    expect(getSessionIndexPerfSnapshot()).toMatchObject({
      sessions: 1,
      persistWrites: 2,
      persistSkips: 1,
    });
  });
});
