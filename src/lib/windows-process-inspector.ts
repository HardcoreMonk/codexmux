import type { IProcessCommandLine, IProcessInspector } from '@/lib/process-inspector';

const createWindowsProcessInspectorUnimplementedError = (): Error & {
  code: string;
  retryable: false;
} => Object.assign(
  new Error('Windows process inspector is not implemented yet. The adapter boundary exists for the Windows process/session detection slice.'),
  {
    code: 'runtime-v2-windows-process-inspector-unimplemented',
    retryable: false as const,
  },
);

const failWindowsProcessInspector = async <T>(): Promise<T> => {
  throw createWindowsProcessInspectorUnimplementedError();
};

export const createWindowsProcessInspector = (): IProcessInspector => ({
  isRunning: (_pid: number): Promise<boolean> => failWindowsProcessInspector(),
  getChildren: (_parentPid: number): Promise<number[]> => failWindowsProcessInspector(),
  getChildrenOf: (_parentPids: number[]): Promise<number[]> => failWindowsProcessInspector(),
  getDescendants: (_rootPid: number): Promise<number[]> => failWindowsProcessInspector(),
  getCwd: (_pid: number): Promise<string | null> => failWindowsProcessInspector(),
  getCommand: (_pid: number): Promise<IProcessCommandLine | null> => failWindowsProcessInspector(),
  getStartTime: (_pid: number): Promise<number | null> => failWindowsProcessInspector(),
  findDescendants: (
    _rootPid: number,
    _predicate: (pid: number) => Promise<boolean>,
  ): Promise<number[]> => failWindowsProcessInspector(),
});
