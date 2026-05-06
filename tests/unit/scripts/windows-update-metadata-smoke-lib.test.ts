import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-update-metadata-smoke-lib.mjs')).href);

describe('Windows update metadata smoke helpers', () => {
  it('reports a blocker when latest.yml references an installer missing from release', async () => {
    const { evaluateWindowsUpdateMetadata } = await loadLib();

    const result = evaluateWindowsUpdateMetadata({
      latestMetadata: {
        version: '0.4.2',
        path: 'codexmux-Setup-0.4.2.exe',
        sha512: 'installer-sha',
        files: [
          {
            url: 'codexmux-Setup-0.4.2.exe',
            sha512: 'installer-sha',
            size: 123,
          },
        ],
      },
      releaseFiles: [
        { name: 'codexmux Setup 0.4.2.exe', size: 123 },
        { name: 'codexmux Setup 0.4.2.exe.blockmap', size: 12 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.referencedInstallerName).toBe('codexmux-Setup-0.4.2.exe');
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toEqual([
      'windows-update-installer-missing',
    ]);
    expect(JSON.stringify(result)).not.toContain('codexmux Setup 0.4.2.exe');
  });

  it('accepts latest.yml when installer, size, sha, and blockmap align', async () => {
    const { evaluateWindowsUpdateMetadata } = await loadLib();

    const result = evaluateWindowsUpdateMetadata({
      latestMetadata: {
        version: '0.4.2',
        path: 'codexmux-Setup-0.4.2.exe',
        sha512: 'installer-sha',
        files: [
          {
            url: 'codexmux-Setup-0.4.2.exe',
            sha512: 'installer-sha',
            size: 123,
          },
        ],
      },
      releaseFiles: [
        { name: 'codexmux-Setup-0.4.2.exe', size: 123 },
        { name: 'codexmux-Setup-0.4.2.exe.blockmap', size: 12 },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      referencedInstallerName: 'codexmux-Setup-0.4.2.exe',
      releaseFileCount: 2,
      checks: [
        'windows-update-version-present',
        'windows-update-path-present',
        'windows-update-file-entry-present',
        'windows-update-path-file-entry-match',
        'windows-update-sha512-present',
        'windows-update-installer-file-present',
        'windows-update-installer-size-matches',
        'windows-update-blockmap-present',
      ],
    });
  });

  it('reports a blocker when latest.yml size differs from the installer artifact', async () => {
    const { evaluateWindowsUpdateMetadata } = await loadLib();

    const result = evaluateWindowsUpdateMetadata({
      latestMetadata: {
        version: '0.4.2',
        path: 'codexmux-Setup-0.4.2.exe',
        sha512: 'installer-sha',
        files: [
          {
            url: 'codexmux-Setup-0.4.2.exe',
            sha512: 'installer-sha',
            size: 124,
          },
        ],
      },
      releaseFiles: [
        { name: 'codexmux-Setup-0.4.2.exe', size: 123 },
        { name: 'codexmux-Setup-0.4.2.exe.blockmap', size: 12 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toEqual([
      'windows-update-installer-size-mismatch',
    ]);
  });
});
