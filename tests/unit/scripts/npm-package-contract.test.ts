import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

interface IPackageManifest {
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: string[];
  main?: string;
  publishConfig?: {
    access?: string;
  };
  scripts?: Record<string, string>;
}

const readPackageManifest = (): IPackageManifest =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as IPackageManifest;

describe('npm package contract', () => {
  it('publishes the CLI runtime and postinstall implementation', () => {
    const manifest = readPackageManifest();

    expect(manifest.main).toBeUndefined();
    expect(manifest.bin).toEqual({
      codexmux: 'bin/codexmux.js',
      cmux: 'bin/codexmux.js',
    });
    expect(manifest.files).toEqual(expect.arrayContaining([
      'bin/',
      'dist/',
      '.next/standalone/',
      'src/config/tmux.conf',
      'scripts/postinstall-node-pty.mjs',
      'scripts/postinstall-node-pty-lib.mjs',
    ]));
    expect(manifest.scripts?.postinstall).toBe('node scripts/postinstall-node-pty.mjs');
    expect(manifest.scripts?.['smoke:npm-package']).toContain('scripts/smoke-npm-package.mjs');
    expect(manifest.publishConfig?.access).toBe('public');
  });

  it('keeps desktop and mobile build packages out of consumer dependencies', () => {
    const manifest = readPackageManifest();
    const buildOnlyPackages = [
      '@capacitor/android',
      '@capacitor/core',
      'builder-util-runtime',
      'electron-updater',
    ];

    buildOnlyPackages.forEach((packageName) => {
      expect(manifest.dependencies?.[packageName]).toBeUndefined();
      expect(manifest.devDependencies?.[packageName]).toBeTypeOf('string');
    });
  });
});
