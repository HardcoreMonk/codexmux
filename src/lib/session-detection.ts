import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

export const isProcessRunning = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    execFileCb('ps', ['-p', String(pid)], (err) => {
      resolve(!err);
    });
  });

export const getChildPids = async (parentPid: number): Promise<number[]> => {
  try {
    const { stdout } = await execFile('pgrep', ['-P', String(parentPid)]);
    return stdout.trim().split('\n').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
};

export interface ISessionWatcher {
  stop: () => void;
}
