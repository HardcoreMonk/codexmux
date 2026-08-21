import { execFile as nodeExecFile } from 'node:child_process';

export interface IProjectVcsSnapshot {
  available: boolean;
  branch: string | null;
  changedFiles: number;
}

export interface IVcsInspectorOptions {
  execFile?: typeof nodeExecFile;
}

const runGit = (
  cwd: string,
  args: string[],
  execFile: typeof nodeExecFile,
): Promise<string> => new Promise((resolve, reject) => {
  execFile('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024,
    timeout: 5_000,
    windowsHide: true,
  }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout.trim());
  });
});

export const inspectProjectVcs = async (
  cwd: string,
  options: IVcsInspectorOptions = {},
): Promise<IProjectVcsSnapshot> => {
  const execFile = options.execFile ?? nodeExecFile;
  try {
    const [branch, status] = await Promise.all([
      runGit(cwd, ['branch', '--show-current'], execFile),
      runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=normal'], execFile),
    ]);
    return {
      available: true,
      branch: branch || null,
      changedFiles: status ? status.split('\n').length : 0,
    };
  } catch {
    return { available: false, branch: null, changedFiles: 0 };
  }
};
