import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/clean-build-artifacts-lib.mjs')).href);

describe('clean build artifacts helper', () => {
  it('removes build artifact directories without touching unrelated files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-clean-build-'));
    await fs.mkdir(path.join(root, '.next'), { recursive: true });
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await fs.mkdir(path.join(root, 'dist-electron'), { recursive: true });
    await fs.writeFile(path.join(root, 'keep.txt'), 'keep', 'utf-8');

    try {
      const { cleanBuildArtifacts } = await loadLib();
      await cleanBuildArtifacts(root);

      await expect(fs.access(path.join(root, '.next'))).rejects.toThrow();
      await expect(fs.access(path.join(root, 'dist'))).rejects.toThrow();
      await expect(fs.access(path.join(root, 'dist-electron'))).rejects.toThrow();
      await expect(fs.readFile(path.join(root, 'keep.txt'), 'utf-8')).resolves.toBe('keep');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
