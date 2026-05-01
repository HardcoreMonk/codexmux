import { spawn, type ChildProcess } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getChildPids,
  getDescendantPids,
  getProcessCommandLine,
  getProcessCwd,
  getProcessStartTime,
  isProcessRunning,
} from '@/lib/session-detection';

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

describe('session detection process helpers', () => {
  it('detects running processes without shelling out on Linux', async () => {
    expect(await isProcessRunning(process.pid)).toBe(true);
    expect(await getProcessCwd(process.pid)).toBe(process.cwd());
    expect(await getProcessStartTime(process.pid)).toEqual(expect.any(Number));
  });

  it('reads child process ids and command metadata', async () => {
    const child = spawnIdleNode();
    const childPid = child.pid;
    expect(childPid).toEqual(expect.any(Number));
    if (!childPid) throw new Error('spawned child process has no pid');

    await waitFor(async () => (await getChildPids(process.pid)).includes(childPid));

    const directChildren = await getChildPids(process.pid);
    const descendants = await getDescendantPids(process.pid);
    const commandLine = await getProcessCommandLine(childPid);

    expect(directChildren).toContain(childPid);
    expect(descendants).toContain(childPid);
    expect(commandLine?.raw).toContain(process.execPath);
    expect(commandLine?.args).toContain('setInterval');
  });
});
