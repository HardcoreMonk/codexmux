import { describe, expect, it } from 'vitest';
import {
  buildElectronBootstrapEnv,
  buildPackagedNodePath,
} from '../../../electron/runtime-env';

describe('Electron runtime environment helpers', () => {
  it('does not inject POSIX launch paths into Windows PATH', () => {
    const env = buildElectronBootstrapEnv({
      platform: 'win32',
      env: {
        PATH: 'C:\\Windows\\System32;C:\\Program Files\\nodejs',
      },
    });

    expect(env.PATH).toBe('C:\\Windows\\System32;C:\\Program Files\\nodejs');
    expect(env.LANG).toBeUndefined();
  });

  it('keeps macOS Finder launch PATH compatibility', () => {
    const env = buildElectronBootstrapEnv({
      platform: 'darwin',
      env: {
        PATH: '/usr/bin:/bin',
      },
    });

    const pathParts = env.PATH?.split(':') ?? [];
    expect(pathParts).toEqual(expect.arrayContaining(['/opt/homebrew/bin', '/usr/local/bin', '/usr/sbin', '/sbin']));
    expect(pathParts).toContain('/usr/bin');
    expect(pathParts).toContain('/bin');
    expect(env.PATH).toContain('/opt/homebrew/bin');
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  it('uses the Windows delimiter for packaged server NODE_PATH', () => {
    expect(buildPackagedNodePath({
      platform: 'win32',
      standaloneModules: 'C:\\codexmux\\resources\\app.asar\\.next\\standalone\\node_modules',
      existingNodePath: 'C:\\extra\\node_modules',
    })).toBe('C:\\codexmux\\resources\\app.asar\\.next\\standalone\\node_modules;C:\\extra\\node_modules');
  });

  it('uses the POSIX delimiter for packaged server NODE_PATH outside Windows', () => {
    expect(buildPackagedNodePath({
      platform: 'darwin',
      standaloneModules: '/Applications/codexmux.app/Contents/Resources/app.asar/.next/standalone/node_modules',
      existingNodePath: '/opt/cmux/node_modules',
    })).toBe('/Applications/codexmux.app/Contents/Resources/app.asar/.next/standalone/node_modules:/opt/cmux/node_modules');
  });
});
