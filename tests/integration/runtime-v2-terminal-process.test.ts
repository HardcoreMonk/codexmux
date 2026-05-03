import { execFile as execFileCb } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { afterEach, describe, expect, it } from 'vitest';
import { createTerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-runtime';

const execFile = promisify(execFileCb);
const isLinux = process.platform === 'linux';
const describeOnLinux = isLinux ? describe : describe.skip;
const TEST_TIMEOUT_MS = 20_000;

const waitFor = async (read: () => string, predicate: (value: string) => boolean): Promise<string> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for terminal output; got ${JSON.stringify(read().slice(-300))}`);
};

describeOnLinux('runtime v2 terminal process path', () => {
  const sessions: string[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(sessions.map((sessionName) =>
      execFile('tmux', ['-L', 'codexmux-runtime-v2', 'kill-session', '-t', sessionName]).catch(() => undefined),
    ));
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    sessions.length = 0;
    tempDirs.length = 0;
  });

  it('creates, attaches, writes stdin, reads stdout, resizes, and kills a real v2 tmux session', async () => {
    await execFile('tmux', ['-V']).catch((err) => {
      throw new Error(`tmux is required for runtime v2 terminal integration test: ${err instanceof Error ? err.message : String(err)}`);
    });
    await import('node-pty').catch((err) => {
      throw new Error(`node-pty native binding is required for runtime v2 terminal integration test: ${err instanceof Error ? err.message : String(err)}`);
    });

    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-runtime-v2-it-'));
    tempDirs.push(cwd);
    const sessionName = `rtv2-it-${process.pid}-${Date.now()}`;
    sessions.push(sessionName);
    const output: string[] = [];
    const runtime = createTerminalWorkerRuntime();

    await runtime.createSession({ sessionName, cols: 80, rows: 24, cwd });
    await runtime.attach(sessionName, 80, 24, (data) => output.push(data));
    await runtime.writeStdin(sessionName, 'pwd\n');
    await waitFor(() => output.join(''), (value) => value.includes(cwd));
    await runtime.resize(sessionName, 100, 30);
    await runtime.writeStdin(sessionName, 'printf runtime-v2-ok\\n\n');
    await waitFor(() => output.join(''), (value) => value.includes('runtime-v2-ok'));
    await expect(runtime.killSession(sessionName)).resolves.toMatchObject({ sessionName, killed: true });
  }, TEST_TIMEOUT_MS);
});
