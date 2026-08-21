import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const runCli = async (packageJson: unknown) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-windows-blockers-'));
  const packagePath = path.join(dir, 'package.json');
  await fs.writeFile(packagePath, JSON.stringify(packageJson), 'utf-8');

  try {
    return await execFileAsync(
      process.execPath,
      [path.join(process.cwd(), 'scripts/windows-platform-blockers.mjs'), packagePath],
      { cwd: process.cwd() },
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

describe('windows platform blockers CLI', () => {
  it('exits cleanly when package scripts contain no Windows blockers', async () => {
    await expect(runCli({
      scripts: {
        build: 'next build',
        clean: 'node scripts/clean.mjs',
      },
    })).resolves.toMatchObject({
      stdout: expect.stringContaining('No Windows platform blockers found'),
    });
  });

  it('exits non-zero and reports blocking package scripts', async () => {
    await expect(runCli({
      scripts: {
        prepublishOnly: 'rm -rf dist && next build',
        postinstall: 'chmod +x helper',
      },
    })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('prepublishOnly'),
    });
  });
});
