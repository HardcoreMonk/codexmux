import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/release-lib.mjs')).href);

describe('release helpers', () => {
  it('increments semantic versions by release type', async () => {
    const { nextVersion } = await loadLib();

    expect(nextVersion('0.4.16', 'patch')).toBe('0.4.17');
    expect(nextVersion('0.4.16', 'minor')).toBe('0.5.0');
    expect(nextVersion('0.4.16', 'major')).toBe('1.0.0');
  });

  it('updates only the package version and README current version row', async () => {
    const { buildReleaseVersionFiles } = await loadLib();
    const packageJson = `${JSON.stringify({ name: 'codexmux', version: '0.4.16' }, null, 2)}\n`;
    const readme = [
      '| 항목 | 현재 상태 |',
      '| --- | --- |',
      '| 패키지 버전 | `0.4.16` |',
      '',
      '과거 업데이트 증거: `0.4.15 -> 0.4.16`',
      '',
    ].join('\n');

    expect(buildReleaseVersionFiles({ packageJson, readme, version: '0.4.17' })).toEqual({
      packageJson: `${JSON.stringify({ name: 'codexmux', version: '0.4.17' }, null, 2)}\n`,
      readme: [
        '| 항목 | 현재 상태 |',
        '| --- | --- |',
        '| 패키지 버전 | `0.4.17` |',
        '',
        '과거 업데이트 증거: `0.4.15 -> 0.4.16`',
        '',
      ].join('\n'),
    });
  });

  it('fails closed when the README current version row is missing', async () => {
    const { buildReleaseVersionFiles } = await loadLib();

    expect(() => buildReleaseVersionFiles({
      packageJson: '{"version":"0.4.16"}\n',
      readme: '# codexmux\n',
      version: '0.4.17',
    })).toThrow('README.md current package version row was not found');
  });

  it('prefers the project release remote and pushes to the explicit main ref', async () => {
    const {
      buildAtomicReleasePushArgs,
      buildReleasePushRefspec,
      resolveReleaseRemote,
    } = await loadLib();

    expect(resolveReleaseRemote({ remotes: ['origin', 'codexmux'] })).toBe('codexmux');
    expect(resolveReleaseRemote({ remotes: ['origin'] })).toBe('origin');
    expect(resolveReleaseRemote({ remotes: ['upstream'], requestedRemote: 'upstream' })).toBe('upstream');
    expect(buildReleasePushRefspec('main')).toBe('HEAD:main');
    expect(buildAtomicReleasePushArgs({
      remote: 'codexmux',
      branch: 'main',
      tag: 'v0.4.17',
    })).toEqual([
      'push',
      '--atomic',
      'codexmux',
      'HEAD:main',
      'refs/tags/v0.4.17',
    ]);
  });

  it('rejects a missing requested release remote or branch', async () => {
    const { buildReleasePushRefspec, resolveReleaseRemote } = await loadLib();

    expect(() => resolveReleaseRemote({
      remotes: ['origin'],
      requestedRemote: 'codexmux',
    })).toThrow('release remote does not exist: codexmux');
    expect(() => buildReleasePushRefspec('')).toThrow('release branch is required');
  });
});
