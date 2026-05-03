import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeTmuxConfigPath, resolveRuntimeWorkerScript } from '@/lib/runtime/worker-paths';

describe('runtime worker path resolution', () => {
  it('uses TypeScript worker entrypoints with tsx in development', () => {
    expect(resolveRuntimeWorkerScript('timeline-worker', {
      cwd: '/repo',
      existsSync: () => true,
      env: { NODE_ENV: 'development', __CMUX_APP_DIR: '/app' },
    })).toEqual({
      scriptPath: path.join('/app', 'src', 'workers', 'timeline-worker.ts'),
      execArgv: ['--import', 'tsx'],
    });
  });

  it('uses dist worker entrypoints in web/npm production', () => {
    expect(resolveRuntimeWorkerScript('terminal-worker', {
      cwd: '/repo',
      existsSync: () => true,
      env: { NODE_ENV: 'production', __CMUX_APP_DIR: '/app' },
    })).toEqual({
      scriptPath: path.join('/app', 'dist', 'workers', 'terminal-worker.js'),
      execArgv: [],
    });
  });

  it('uses app.asar.unpacked dist worker entrypoints in packaged Electron', () => {
    expect(resolveRuntimeWorkerScript('terminal-worker', {
      cwd: '/repo',
      existsSync: () => true,
      env: {
        NODE_ENV: 'production',
        __CMUX_APP_DIR: '/Applications/codexmux.app/Contents/Resources/app.asar',
        __CMUX_APP_DIR_UNPACKED: '/Applications/codexmux.app/Contents/Resources/app.asar.unpacked',
      },
    })).toEqual({
      scriptPath: path.join('/Applications/codexmux.app/Contents/Resources/app.asar.unpacked', 'dist', 'workers', 'terminal-worker.js'),
      execArgv: [],
    });
  });

  it('fails clearly when runtime worker script is missing', () => {
    expect(() => resolveRuntimeWorkerScript('storage-worker', {
      cwd: '/repo',
      existsSync: () => false,
      env: { NODE_ENV: 'production', __CMUX_APP_DIR: '/app' },
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-worker-script-missing',
      retryable: false,
    }));
  });

  it('resolves runtime tmux config from the unpacked Electron app dir', () => {
    expect(resolveRuntimeTmuxConfigPath({
      cwd: '/repo',
      existsSync: () => true,
      env: {
        NODE_ENV: 'production',
        __CMUX_APP_DIR: '/Applications/codexmux.app/Contents/Resources/app.asar',
        __CMUX_APP_DIR_UNPACKED: '/Applications/codexmux.app/Contents/Resources/app.asar.unpacked',
      },
    })).toBe(path.join('/Applications/codexmux.app/Contents/Resources/app.asar.unpacked', 'src', 'config', 'tmux.conf'));
  });

  it('fails clearly when runtime tmux config is missing', () => {
    expect(() => resolveRuntimeTmuxConfigPath({
      cwd: '/repo',
      existsSync: () => false,
      env: { NODE_ENV: 'production', __CMUX_APP_DIR: '/app' },
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-tmux-config-missing',
      retryable: false,
    }));
  });
});
