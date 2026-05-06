import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const buildElectronBuilderArgs = ({ dir = false, extraArgs = [] } = {}) => [
  '--win',
  ...(dir ? ['--dir'] : []),
  '--config.npmRebuild=false',
  ...extraArgs,
];

export const buildElectronBuilderEnv = ({ env = process.env, shimDir }) => {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const currentPath = env[pathKey];

  return {
    ...env,
    [pathKey]: currentPath ? `${shimDir}${path.delimiter}${currentPath}` : shimDir,
  };
};

export const createPnpmShim = (shimDir) => {
  fs.mkdirSync(shimDir, { recursive: true });

  if (process.platform === 'win32') {
    const shimPath = path.join(shimDir, 'pnpm.cmd');
    fs.writeFileSync(shimPath, '@echo off\r\ncorepack pnpm %*\r\n');
    return shimPath;
  }

  const shimPath = path.join(shimDir, 'pnpm');
  fs.writeFileSync(shimPath, '#!/usr/bin/env sh\nexec corepack pnpm "$@"\n', { mode: 0o755 });
  return shimPath;
};

export const runElectronBuilder = ({
  cwd = process.cwd(),
  dir = false,
  env = process.env,
  extraArgs = [],
  stdio = 'inherit',
} = {}) =>
  new Promise((resolve) => {
    const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexmux-electron-builder-'));
    createPnpmShim(shimDir);

    const builderCli = path.join(cwd, 'node_modules', 'electron-builder', 'cli.js');
    const child = spawn(process.execPath, [builderCli, ...buildElectronBuilderArgs({ dir, extraArgs })], {
      cwd,
      env: buildElectronBuilderEnv({ env, shimDir }),
      stdio,
    });

    child.on('close', (exitCode, signal) => {
      fs.rmSync(shimDir, { recursive: true, force: true });
      resolve({ exitCode, signal });
    });
  });
