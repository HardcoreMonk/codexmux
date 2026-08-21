import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/pack-electron-windows-lib.mjs')).href);

describe('Windows Electron package wrapper helpers', () => {
  it('builds a Windows unpacked electron-builder command without native rebuild', async () => {
    const { buildElectronBuilderArgs } = await loadLib();

    expect(buildElectronBuilderArgs({ dir: true })).toEqual([
      '--win',
      '--dir',
      '--config.npmRebuild=false',
      '--publish',
      'never',
    ]);
  });

  it('keeps implicit publishing disabled after caller-provided arguments', async () => {
    const { buildElectronBuilderArgs } = await loadLib();

    expect(buildElectronBuilderArgs({
      extraArgs: ['--config.compression=maximum', '--publish', 'always'],
    })).toEqual([
      '--win',
      '--config.npmRebuild=false',
      '--config.compression=maximum',
      '--publish',
      'always',
      '--publish',
      'never',
    ]);
  });

  it('prepends a temporary pnpm shim directory to PATH', async () => {
    const { buildElectronBuilderEnv } = await loadLib();

    expect(buildElectronBuilderEnv({ env: { PATH: 'C:\\Windows' }, shimDir: 'C:\\tmp\\codexmux-bin' }).PATH)
      .toBe('C:\\tmp\\codexmux-bin;C:\\Windows');
  });

  it('builds Electron native prebuild install tasks for the standalone bundle', async () => {
    const { buildElectronNativePrebuildTasks } = await loadLib();

    expect(buildElectronNativePrebuildTasks({
      cwd: 'D:\\repo\\codexmux',
      electronVersion: '41.1.1',
      arch: 'x64',
    })).toEqual([
      {
        packageName: 'better-sqlite3',
        cwd: 'D:\\repo\\codexmux\\.next\\standalone\\node_modules\\better-sqlite3',
        args: [
          '--runtime',
          'electron',
          '--target',
          '41.1.1',
          '--arch',
          'x64',
          '--platform',
          'win32',
        ],
      },
    ]);
  });
});
