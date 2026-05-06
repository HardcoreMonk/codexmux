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
    ]);
  });

  it('prepends a temporary pnpm shim directory to PATH', async () => {
    const { buildElectronBuilderEnv } = await loadLib();

    expect(buildElectronBuilderEnv({ env: { PATH: 'C:\\Windows' }, shimDir: 'C:\\tmp\\codexmux-bin' }).PATH)
      .toBe('C:\\tmp\\codexmux-bin;C:\\Windows');
  });
});
