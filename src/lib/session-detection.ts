import {
  defaultProcessInspector,
  type IProcessCommandLine,
} from '@/lib/process-inspector';

export type { IProcessCommandLine } from '@/lib/process-inspector';

export const isProcessRunning = (pid: number): Promise<boolean> =>
  defaultProcessInspector.isRunning(pid);

export const getChildPidsOf = (parentPids: number[]): Promise<number[]> =>
  defaultProcessInspector.getChildrenOf(parentPids);

export const getChildPids = (parentPid: number): Promise<number[]> =>
  defaultProcessInspector.getChildren(parentPid);

export const getDescendantPids = (rootPid: number): Promise<number[]> =>
  defaultProcessInspector.getDescendants(rootPid);

export const getProcessCwd = (pid: number): Promise<string | null> =>
  defaultProcessInspector.getCwd(pid);

export const getProcessCommandLine = (pid: number): Promise<IProcessCommandLine | null> =>
  defaultProcessInspector.getCommand(pid);

export const getProcessStartTime = (pid: number): Promise<number | null> =>
  defaultProcessInspector.getStartTime(pid);

export const getLatestChildPid = async (parentPid: number): Promise<number | null> => {
  const childPids = await getChildPids(parentPid);
  if (childPids.length === 0) return null;

  const withStart = await Promise.all(
    childPids.map(async (pid) => ({
      pid,
      startedAt: await getProcessStartTime(pid),
    })),
  );
  withStart.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0) || b.pid - a.pid);
  return withStart[0]?.pid ?? null;
};

export interface ISessionWatcher {
  stop: () => void;
}
