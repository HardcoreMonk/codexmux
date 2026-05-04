import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isAllowedJsonlPath', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows local Codex session JSONL paths', async () => {
    const home = path.join(os.tmpdir(), 'codexmux-path-validation-local');
    vi.stubEnv('HOME', home);

    const { isAllowedJsonlPath } = await import('@/lib/path-validation');

    expect(isAllowedJsonlPath(path.join(home, '.codex', 'sessions', '2026', '05', '05', 'session.jsonl'))).toBe(true);
  });

  it('rejects legacy remote Codex JSONL paths', async () => {
    const home = path.join(os.tmpdir(), 'codexmux-path-validation-remote');
    vi.stubEnv('HOME', home);

    const { isAllowedJsonlPath } = await import('@/lib/path-validation');

    expect(isAllowedJsonlPath(path.join(home, '.codexmux', 'remote', 'codex', 'win11', 'session.jsonl'))).toBe(false);
  });
});
