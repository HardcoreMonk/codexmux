import { spawn, type ChildProcess } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultProcessInspector } from '@/lib/process-inspector';

const children: ChildProcess[] = [];

const waitFor = async (predicate: () => Promise<boolean>): Promise<void> => {
  for (let i = 0; i < 30; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition was not met before timeout');
};

const spawnIdleNode = (): ChildProcess => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  children.push(child);
  return child;
};

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.pid && !child.killed) child.kill('SIGKILL');
  }
});

describe('defaultProcessInspector', () => {
  it('reads process primitives without Codex-specific policy', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const child = spawnIdleNode();
    if (!child.pid) throw new Error('spawned child process has no pid');

    await waitFor(async () => (await defaultProcessInspector.getChildren(process.pid)).includes(child.pid!));

    expect(await defaultProcessInspector.isRunning(process.pid)).toBe(true);
    expect(await defaultProcessInspector.getCwd(process.pid)).toBe(process.cwd());
    expect(await defaultProcessInspector.getStartTime(process.pid)).toEqual(expect.any(Number));
    expect(await defaultProcessInspector.getChildren(process.pid)).toContain(child.pid);
    expect(await defaultProcessInspector.getDescendants(process.pid)).toContain(child.pid);
    const command = await defaultProcessInspector.getCommand(child.pid);
    expect(command?.raw).toContain(process.execPath);
  });
});
