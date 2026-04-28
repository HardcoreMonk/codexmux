import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { NextApiRequest } from 'next';

const originalHome = process.env.HOME;
let tmpDirs: string[] = [];

const clearCachedToken = () => {
  delete (globalThis as unknown as { __ptCliToken?: string }).__ptCliToken;
};

const importCliTokenWithTempHome = async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), 'codexmux-cli-token-'));
  tmpDirs.push(tmpHome);
  process.env.HOME = tmpHome;
  clearCachedToken();
  vi.resetModules();
  return import('@/lib/cli-token');
};

const requestWithHeaders = (headers: Record<string, string>): NextApiRequest =>
  ({ headers }) as unknown as NextApiRequest;

describe('cli token verification', () => {
  afterEach(() => {
    process.env.HOME = originalHome;
    clearCachedToken();
    vi.resetModules();
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it('accepts the codexmux CLI token header', async () => {
    const { getCliToken, verifyCliToken } = await importCliTokenWithTempHome();
    const token = getCliToken();

    expect(verifyCliToken(requestWithHeaders({ 'x-cmux-token': token }))).toBe(true);
  });

  it('rejects requests without the codexmux CLI token header', async () => {
    const { verifyCliToken } = await importCliTokenWithTempHome();

    expect(verifyCliToken(requestWithHeaders({}))).toBe(false);
  });
});
