import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-electron-packaging-smoke-lib.mjs')).href);

describe('Windows Electron packaging smoke helpers', () => {
  it('reports blockers for the current mac-only packaging shape', async () => {
    const { validateWindowsElectronPackaging } = await loadLib();
    const result = validateWindowsElectronPackaging({
      packageJson: {
        scripts: {
          'pack:electron': 'electron-builder --mac',
          'pack:electron:dev': 'electron-builder --mac',
        },
      },
      builderConfig: {
        mac: {
          target: ['dmg', 'zip'],
        },
      },
      resources: new Set(['build-resources/icon.png']),
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toEqual([
      'pack-electron-default-not-windows',
      'pack-electron-dev-not-windows-dir',
      'windows-builder-target-missing',
      'windows-nsis-config-missing',
      'windows-icon-missing',
    ]);
  });

  it('accepts a Windows installer and zip packaging contract', async () => {
    const { validateWindowsElectronPackaging } = await loadLib();
    const result = validateWindowsElectronPackaging({
      packageJson: {
        scripts: {
          'pack:electron': 'electron-builder --win',
          'pack:electron:dev': 'electron-builder --win --dir',
          'pack:electron:mac': 'electron-builder --mac',
        },
      },
      builderConfig: {
        win: {
          icon: 'build-resources/icon.ico',
          target: [
            { target: 'nsis', arch: ['x64'] },
            { target: 'zip', arch: ['x64'] },
          ],
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
        },
      },
      resources: new Set(['build-resources/icon.ico']),
    });

    expect(result).toMatchObject({
      ok: true,
      checks: [
        'pack-electron-default-windows',
        'pack-electron-dev-windows-dir',
        'windows-builder-nsis-target',
        'windows-builder-zip-target',
        'windows-nsis-installer-options',
        'windows-icon-present',
      ],
    });
  });

  it('accepts the Windows packaging wrapper as the default package command', async () => {
    const { validateWindowsElectronPackaging } = await loadLib();
    const result = validateWindowsElectronPackaging({
      packageJson: {
        scripts: {
          'pack:electron': 'corepack pnpm build:electron && node scripts/pack-electron-windows.mjs',
          'pack:electron:dev': 'corepack pnpm build:electron && node scripts/pack-electron-windows.mjs --dir',
          'pack:electron:mac': 'electron-builder --mac',
        },
      },
      builderConfig: {
        win: {
          icon: 'build-resources/icon.ico',
          target: [
            { target: 'nsis', arch: ['x64'] },
            { target: 'zip', arch: ['x64'] },
          ],
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
        },
      },
      resources: new Set(['build-resources/icon.ico']),
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toContain('pack-electron-default-windows');
    expect(result.checks).toContain('pack-electron-dev-windows-dir');
  });

  it('normalizes string and object target entries', async () => {
    const { collectElectronBuilderTargets } = await loadLib();

    expect(collectElectronBuilderTargets(['nsis', { target: 'zip' }, { target: 'portable' }])).toEqual([
      'nsis',
      'zip',
      'portable',
    ]);
  });
});
