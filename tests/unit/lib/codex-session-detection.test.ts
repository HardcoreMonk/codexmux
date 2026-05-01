import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempHome: string;

const sessionA = '019dd56a-e200-7890-a1a4-4a7cad2fe112';
const sessionB = '019dd56b-006c-7f81-a5a1-96cdc0dfea93';

const line = (value: unknown): string => JSON.stringify(value);

const writeSession = async (
  sessionId: string,
  startedAt: string,
  cwd: string,
): Promise<string> => {
  const dir = path.join(tempHome, '.codex', 'sessions', '2026', '04', '29');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `rollout-2026-04-29T00-00-00-${sessionId}.jsonl`);
  await fs.writeFile(filePath, [
    line({
      timestamp: startedAt,
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: startedAt,
      },
    }),
    line({
      timestamp: startedAt,
      type: 'turn_context',
      payload: { cwd },
    }),
  ].join('\n'));
  return filePath;
};

describe('findCodexSessionJsonl', () => {
  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-detect-'));
    vi.resetModules();
    vi.stubEnv('HOME', tempHome);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('does not attach a session by cwd alone', async () => {
    await writeSession(sessionA, '2026-04-29T00:00:00.000Z', '/work/project');

    const { findCodexSessionJsonl } = await import('@/lib/codex-session-detection');
    const meta = await findCodexSessionJsonl(null, '/work/project');

    expect(meta).toBeNull();
  });

  it('matches same-cwd sessions by process start time', async () => {
    await writeSession(sessionA, '2026-04-29T00:00:00.000Z', '/work/project');
    await writeSession(sessionB, '2026-04-29T00:05:00.000Z', '/work/project');

    const { findCodexSessionJsonl } = await import('@/lib/codex-session-detection');
    const meta = await findCodexSessionJsonl(null, '/work/project', {
      processStartedAt: Date.parse('2026-04-29T00:00:02.000Z'),
    });

    expect(meta?.sessionId).toBe(sessionA);
  });

  it('matches sessions that write JSONL shortly after the Codex process starts', async () => {
    await writeSession(sessionA, '2026-04-29T00:02:00.000Z', '/work/project');
    await writeSession(sessionB, '2026-04-29T00:10:00.000Z', '/work/project');

    const { findCodexSessionJsonl } = await import('@/lib/codex-session-detection');
    const meta = await findCodexSessionJsonl(null, '/work/project', {
      processStartedAt: Date.parse('2026-04-29T00:00:30.000Z'),
    });

    expect(meta?.sessionId).toBe(sessionA);
  });

  it('allows cwd fallback only when explicitly requested', async () => {
    await writeSession(sessionA, '2026-04-29T00:00:00.000Z', '/work/project');

    const { findCodexSessionJsonl } = await import('@/lib/codex-session-detection');
    const meta = await findCodexSessionJsonl(null, '/work/project', {
      allowCwdFallback: true,
    });

    expect(meta?.sessionId).toBe(sessionA);
  });

  it('normalizes rollout basenames to plain Codex UUIDs', async () => {
    await writeSession(sessionA, '2026-04-29T00:00:00.000Z', '/work/project');

    const { findCodexSessionJsonl } = await import('@/lib/codex-session-detection');
    const meta = await findCodexSessionJsonl(
      `rollout-2026-04-29T00-00-00-${sessionA}`,
      '/work/project',
    );

    expect(meta?.sessionId).toBe(sessionA);
  });
});
