import { spawn, type ChildProcess } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createWindowsProcessInspector } from '@/lib/windows-process-inspector';

const children: ChildProcess[] = [];
const missingPid = 999_999_999;

const waitFor = async (predicate: () => Promise<boolean>): Promise<void> => {
  for (let i = 0; i < 60; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
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

const describeWindows = process.platform === 'win32' ? describe : describe.skip;

describeWindows('createWindowsProcessInspector', () => {
  it('reads running process command and start metadata', async () => {
    const inspector = createWindowsProcessInspector();

    expect(await inspector.isRunning(process.pid)).toBe(true);
    expect(await inspector.isRunning(missingPid)).toBe(false);
    expect(await inspector.getCwd(process.pid)).toBe(process.cwd());
    expect(await inspector.getStartTime(process.pid)).toEqual(expect.any(Number));

    const command = await inspector.getCommand(process.pid);
    expect(command?.raw.toLowerCase()).toContain(process.execPath.toLowerCase());
  }, 20_000);

  it('discovers child and descendant processes', async () => {
    const inspector = createWindowsProcessInspector();
    const child = spawnIdleNode();
    const childPid = child.pid;
    expect(childPid).toEqual(expect.any(Number));
    if (!childPid) throw new Error('spawned child process has no pid');

    await waitFor(async () => (await inspector.getChildren(process.pid)).includes(childPid));

    expect(await inspector.getChildren(process.pid)).toContain(childPid);
    expect(await inspector.getChildrenOf([process.pid])).toContain(childPid);
    expect(await inspector.getDescendants(process.pid)).toContain(childPid);

    const command = await inspector.getCommand(childPid);
    expect(command?.raw).toContain('setInterval');
  }, 20_000);

  it('returns empty metadata for missing processes', async () => {
    const inspector = createWindowsProcessInspector();

    expect(await inspector.getChildren(missingPid)).toEqual([]);
    expect(await inspector.getDescendants(missingPid)).toEqual([]);
    expect(await inspector.getCwd(missingPid)).toBeNull();
    expect(await inspector.getCommand(missingPid)).toBeNull();
    expect(await inspector.getStartTime(missingPid)).toBeNull();
  }, 20_000);
});
