import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalAppDir = process.env.__CMUX_APP_DIR;

afterEach(() => {
  if (originalAppDir === undefined) {
    delete process.env.__CMUX_APP_DIR;
  } else {
    process.env.__CMUX_APP_DIR = originalAppDir;
  }
  vi.resetModules();
});

describe('build info', () => {
  it('reads build metadata from the app root when the runtime cwd changes', async () => {
    const appDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-build-info-'));
    await fs.mkdir(path.join(appDir, 'dist'), { recursive: true });
    await fs.writeFile(
      path.join(appDir, 'dist', 'build-info.json'),
      JSON.stringify({ commit: 'abc1234', buildTime: '2026-05-03T09:37:27.521Z' }),
      'utf8',
    );
    process.env.__CMUX_APP_DIR = appDir;

    const { getBuildInfo } = await import('@/lib/build-info');

    expect(getBuildInfo()).toMatchObject({
      commit: 'abc1234',
      buildTime: '2026-05-03T09:37:27.521Z',
    });
  });
});
