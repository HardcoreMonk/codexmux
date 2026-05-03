import fs from 'fs';
import path from 'path';

export type TRuntimeWorkerName = 'storage-worker' | 'terminal-worker' | 'timeline-worker' | 'status-worker';

export interface IWorkerScriptResolution {
  scriptPath: string;
  execArgv: string[];
}

export interface IResolveRuntimeWorkerScriptOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  existsSync?: (path: string) => boolean;
}

const resolveRuntimeAppDir = (options: IResolveRuntimeWorkerScriptOptions = {}): string => {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? path.join(/*turbopackIgnore: true*/ process.cwd());
  if (env.NODE_ENV !== 'production') return env.__CMUX_APP_DIR || cwd;
  return env.__CMUX_APP_DIR_UNPACKED || env.__CMUX_APP_DIR || cwd;
};

export const resolveRuntimeWorkerScript = (
  name: TRuntimeWorkerName,
  options: IResolveRuntimeWorkerScriptOptions = {},
): IWorkerScriptResolution => {
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  const dev = env.NODE_ENV !== 'production';
  const appDir = resolveRuntimeAppDir(options);
  const resolution = dev
    ? {
        scriptPath: path.join(appDir, 'src', 'workers', `${name}.ts`),
        execArgv: ['--import', 'tsx'],
      }
    : {
        scriptPath: path.join(appDir, 'dist', 'workers', `${name}.js`),
        execArgv: [],
      };

  if (!existsSync(resolution.scriptPath)) {
    throw Object.assign(
      new Error(`Runtime v2 worker script is missing: ${resolution.scriptPath}`),
      {
        code: 'runtime-v2-worker-script-missing',
        retryable: false,
      },
    );
  }
  return resolution;
};

export const resolveRuntimeTmuxConfigPath = (
  options: IResolveRuntimeWorkerScriptOptions = {},
): string => {
  const existsSync = options.existsSync ?? fs.existsSync;
  const configPath = path.join(resolveRuntimeAppDir(options), 'src', 'config', 'tmux.conf');
  if (!existsSync(configPath)) {
    throw Object.assign(
      new Error(`Runtime v2 tmux config is missing: ${configPath}`),
      {
        code: 'runtime-v2-tmux-config-missing',
        retryable: false,
      },
    );
  }
  return configPath;
};
