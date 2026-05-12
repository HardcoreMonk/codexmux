import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/postinstall-node-pty-lib.mjs')).href);

describe('node-pty postinstall helper', () => {
  it('skips chmod work on Windows', async () => {
    const { ensureNodePtySpawnHelpersExecutable } = await loadLib();

    await expect(ensureNodePtySpawnHelpersExecutable(process.cwd(), {
      platform: 'win32',
    })).resolves.toEqual({
      skipped: true,
      updated: 0,
    });
  });

  it('chmods discovered spawn-helper files on POSIX platforms', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-node-pty-'));
    const helper = path.join(
      root,
      'node_modules',
      '.pnpm',
      'node-pty@1.2.0',
      'node_modules',
      'node-pty',
      'prebuilds',
      'linux-x64',
      'spawn-helper',
    );
    await fs.mkdir(path.dirname(helper), { recursive: true });
    await fs.writeFile(helper, '', 'utf-8');

    try {
      const { ensureNodePtySpawnHelpersExecutable } = await loadLib();

      await expect(ensureNodePtySpawnHelpersExecutable(root, {
        platform: 'linux',
      })).resolves.toEqual({
        skipped: false,
        updated: 1,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
