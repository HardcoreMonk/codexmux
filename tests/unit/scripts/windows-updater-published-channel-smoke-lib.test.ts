import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-updater-published-channel-smoke-lib.mjs')).href);

describe('Windows updater published channel smoke helpers', () => {
  it('uses an explicit installed version override when checking a published update', async () => {
    const { resolveWindowsPublishedChannelCurrentVersion } = await loadLib();

    expect(resolveWindowsPublishedChannelCurrentVersion({
      env: { CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION: '0.4.2' },
      packageVersion: '0.4.3',
    })).toBe('0.4.2');

    expect(resolveWindowsPublishedChannelCurrentVersion({
      env: { CODEXMUX_WINDOWS_UPDATER_CURRENT_VERSION: '   ' },
      packageVersion: '0.4.3',
    })).toBe('0.4.3');
  });

  it('reports a missing GitHub release as a published update blocker', async () => {
    const { evaluateWindowsPublishedUpdateChannel } = await loadLib();

    const result = evaluateWindowsPublishedUpdateChannel({
      releases: [],
      currentVersion: '0.4.2',
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toEqual([
      'windows-published-release-missing',
    ]);
    expect(result.mutatesSystem).toBe(false);
  });

  it('accepts a published release with latest.yml, installer, and blockmap assets', async () => {
    const { evaluateWindowsPublishedUpdateChannel } = await loadLib();

    const result = evaluateWindowsPublishedUpdateChannel({
      currentVersion: '0.4.2',
      latestMetadata: {
        version: '0.4.3',
        path: 'codexmux-Setup-0.4.3.exe',
        sha512: 'installer-sha',
        files: [
          {
            url: 'codexmux-Setup-0.4.3.exe',
            sha512: 'installer-sha',
            size: 123,
          },
        ],
      },
      releases: [
        {
          tag_name: 'v0.4.3',
          draft: false,
          prerelease: false,
          html_url: 'https://github.com/HardcoreMonk/codexmux/releases/tag/v0.4.3',
          assets: [
            {
              name: 'latest.yml',
              size: 345,
              browser_download_url: 'https://github.com/HardcoreMonk/codexmux/releases/download/v0.4.3/latest.yml',
            },
            {
              name: 'codexmux-Setup-0.4.3.exe',
              size: 123,
              browser_download_url: 'https://github.com/HardcoreMonk/codexmux/releases/download/v0.4.3/codexmux-Setup-0.4.3.exe',
            },
            {
              name: 'codexmux-Setup-0.4.3.exe.blockmap',
              size: 456,
              browser_download_url: 'https://github.com/HardcoreMonk/codexmux/releases/download/v0.4.3/codexmux-Setup-0.4.3.exe.blockmap',
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      currentVersion: '0.4.2',
      latestVersion: '0.4.3',
      latestReleaseTag: 'v0.4.3',
      referencedInstallerName: 'codexmux-Setup-0.4.3.exe',
      blockers: [],
    });
    expect(result.checks).toEqual([
      'windows-published-release-present',
      'windows-published-latest-yml-asset-present',
      'windows-published-version-present',
      'windows-published-tag-version-matches',
      'windows-published-version-newer-than-current',
      'windows-published-installer-asset-present',
      'windows-published-installer-size-matches',
      'windows-published-sha512-present',
      'windows-published-blockmap-asset-present',
      'windows-published-download-urls-present',
    ]);
  });

  it('blocks when the requested tag and latest.yml version do not match', async () => {
    const { evaluateWindowsPublishedUpdateChannel } = await loadLib();

    const result = evaluateWindowsPublishedUpdateChannel({
      currentVersion: '0.4.16',
      targetTag: 'v0.4.17',
      includePrerelease: true,
      latestMetadata: {
        version: '0.4.18',
        path: 'codexmux-Setup-0.4.18.exe',
        sha512: 'installer-sha',
        files: [
          {
            url: 'codexmux-Setup-0.4.18.exe',
            sha512: 'installer-sha',
            size: 123,
          },
        ],
      },
      releases: [
        {
          tag_name: 'v0.4.17',
          draft: false,
          prerelease: true,
          assets: [
            { name: 'latest.yml', size: 345, browser_download_url: 'https://example.test/latest.yml' },
            { name: 'codexmux-Setup-0.4.18.exe', size: 123, browser_download_url: 'https://example.test/installer.exe' },
            { name: 'codexmux-Setup-0.4.18.exe.blockmap', size: 456, browser_download_url: 'https://example.test/blockmap' },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toContain(
      'windows-published-tag-version-mismatch',
    );
  });

  it('selects the requested release tag even when a newer release exists', async () => {
    const { selectLatestPublishedRelease } = await loadLib();
    const releases = [
      {
        tag_name: 'v0.4.18',
        draft: false,
        prerelease: false,
        published_at: '2026-07-13T00:00:00Z',
      },
      {
        tag_name: 'v0.4.17',
        draft: false,
        prerelease: true,
        published_at: '2026-07-12T00:00:00Z',
      },
    ];

    expect(selectLatestPublishedRelease({
      releases,
      includePrerelease: true,
      targetTag: 'v0.4.17',
    })?.tag_name).toBe('v0.4.17');
  });

  it('fails closed when the requested release tag is missing', async () => {
    const { evaluateWindowsPublishedUpdateChannel } = await loadLib();

    const result = evaluateWindowsPublishedUpdateChannel({
      releases: [
        {
          tag_name: 'v0.4.18',
          draft: false,
          prerelease: false,
        },
      ],
      currentVersion: '0.4.16',
      targetTag: 'v0.4.17',
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toEqual([
      'windows-published-target-release-missing',
    ]);
  });

  it('accepts the requested prerelease only when prereleases are enabled', async () => {
    const { selectLatestPublishedRelease } = await loadLib();
    const releases = [
      {
        tag_name: 'v0.4.17',
        draft: false,
        prerelease: true,
        published_at: '2026-07-12T00:00:00Z',
      },
    ];

    expect(selectLatestPublishedRelease({
      releases,
      includePrerelease: false,
      targetTag: 'v0.4.17',
    })).toBeNull();
    expect(selectLatestPublishedRelease({
      releases,
      includePrerelease: true,
      targetTag: 'v0.4.17',
    })?.tag_name).toBe('v0.4.17');
  });

  it('blocks when the published version is not newer than the installed version', async () => {
    const { evaluateWindowsPublishedUpdateChannel } = await loadLib();

    const result = evaluateWindowsPublishedUpdateChannel({
      currentVersion: '0.4.2',
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
      releases: [
        {
          tag_name: 'v0.4.2',
          draft: false,
          prerelease: false,
          assets: [
            { name: 'latest.yml', size: 345, browser_download_url: 'https://example.test/latest.yml' },
            { name: 'codexmux-Setup-0.4.2.exe', size: 123, browser_download_url: 'https://example.test/installer.exe' },
            { name: 'codexmux-Setup-0.4.2.exe.blockmap', size: 456, browser_download_url: 'https://example.test/blockmap' },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.map((blocker: { ruleId: string }) => blocker.ruleId)).toContain(
      'windows-published-version-not-newer',
    );
  });

  it('builds a sanitized artifact payload', async () => {
    const { buildWindowsPublishedUpdateArtifactPayload } = await loadLib();

    const payload = buildWindowsPublishedUpdateArtifactPayload({
      ok: false,
      mutatesSystem: false,
      currentVersion: '0.4.2',
      latestVersion: null,
      latestReleaseTag: null,
      releaseCount: 0,
      referencedInstallerName: null,
      latestReleaseUrl: null,
      checks: [],
      blockers: [
        {
          ruleId: 'windows-published-release-missing',
          message: 'No published GitHub release was found.',
        },
      ],
    });

    expect(payload).toEqual({
      ok: false,
      mutatesSystem: false,
      currentVersion: '0.4.2',
      latestVersion: null,
      latestReleaseTag: null,
      latestReleaseUrl: null,
      releaseCount: 0,
      referencedInstallerName: null,
      checks: [],
      blockers: [
        {
          ruleId: 'windows-published-release-missing',
          message: 'No published GitHub release was found.',
        },
      ],
    });
  });
});
