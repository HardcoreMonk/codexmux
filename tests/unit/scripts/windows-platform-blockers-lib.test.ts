import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-platform-blockers-lib.mjs')).href);

describe('windows platform blocker scanner', () => {
  it('detects POSIX-only and Linux service script patterns', async () => {
    const { findWindowsPlatformBlockers } = await loadLib();

    expect(findWindowsPlatformBlockers({
      postinstall: 'chmod +x node_modules/.bin/tool',
      prepublishOnly: 'rm -rf dist && next build',
      'deploy:local': 'systemctl --user restart codexmux.service',
      lint: 'eslint',
    })).toEqual([
      { script: 'postinstall', ruleId: 'posix-chmod', severity: 'blocker' },
      { script: 'prepublishOnly', ruleId: 'posix-rm-rf', severity: 'blocker' },
      { script: 'deploy:local', ruleId: 'linux-systemd', severity: 'blocker' },
    ]);
  });

  it('returns an empty list for Windows-safe script examples', async () => {
    const { findWindowsPlatformBlockers } = await loadLib();

    expect(findWindowsPlatformBlockers({
      build: 'next build && node scripts/post-build.js',
      clean: 'node scripts/clean-build-output.mjs',
    })).toEqual([]);
  });
});
