import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const loadLib = async () => import('@/../scripts/linux-session-governance-smoke-lib.mjs');

describe('Linux session governance smoke helpers', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-linux-governance-smoke-'));
    await fs.mkdir(path.join(dir, 'docs'));
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Guidance\n');
    await fs.writeFile(path.join(dir, 'docs', 'plan.md'), '# Plan\n');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('detects project writes using relative metadata-only snapshots', async () => {
    const { snapshotReadonlyTree, diffReadonlyTreeSnapshots } = await loadLib();
    const before = await snapshotReadonlyTree(dir);
    await fs.writeFile(path.join(dir, 'docs', 'plan.md'), '# Changed\n');
    const after = await snapshotReadonlyTree(dir);
    expect(diffReadonlyTreeSnapshots(before, after)).toEqual(['docs/plan.md']);
    expect(JSON.stringify(before)).not.toContain('# Guidance');
    expect(JSON.stringify(before)).not.toContain(dir);
  });

  it('validates private DB modes and reports sanitized check identifiers', async () => {
    const { isPrivateDatabaseMode, validateLinuxSessionGovernanceSmoke } = await loadLib();
    expect(isPrivateDatabaseMode(0o100600)).toBe(true);
    expect(isPrivateDatabaseMode(0o100644)).toBe(false);
    expect(validateLinuxSessionGovernanceSmoke({
      search: true,
      replay: true,
      annotation: true,
      rootApproval: true,
      projectImport: true,
      governance: true,
      projectUnchanged: true,
      databasePrivate: true,
      rollbackRecovered: true,
      terminalStayedConnected: true,
    })).toMatchObject({ ok: true, failures: [] });
    expect(validateLinuxSessionGovernanceSmoke({
      search: true,
      replay: false,
      annotation: true,
      rootApproval: true,
      projectImport: true,
      governance: false,
      projectUnchanged: true,
      databasePrivate: true,
      rollbackRecovered: false,
      terminalStayedConnected: true,
    }).failures).toEqual(['replay', 'governance', 'rollback-recovered']);
  });
});
