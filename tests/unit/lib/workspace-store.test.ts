import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHome = process.env.HOME;

describe('workspace store', () => {
  let homeDir: string;
  let dataDir: string;

  beforeEach(async () => {
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-workspace-store-'));
    dataDir = path.join(homeDir, '.codexmux');
    await fs.mkdir(dataDir, { recursive: true });
    process.env.HOME = homeDir;
    delete (globalThis as { __codexmuxWorkspaceLock?: unknown }).__codexmuxWorkspaceLock;
    delete (globalThis as { __codexmuxWorkspacesContentCache?: unknown }).__codexmuxWorkspacesContentCache;
    vi.resetModules();
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(homeDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('trims and persists workspace names on rename', async () => {
    await fs.writeFile(
      path.join(dataDir, 'workspaces.json'),
      JSON.stringify({
        workspaces: [
          { id: 'ws-one', name: 'Old name', directories: ['/tmp/project'] },
        ],
        groups: [],
        activeWorkspaceId: 'ws-one',
        sidebarCollapsed: false,
        sidebarWidth: 240,
        updatedAt: new Date(0).toISOString(),
      }),
    );

    const { getWorkspaces, renameWorkspace } = await import('@/lib/workspace-store');

    const renamed = await renameWorkspace('ws-one', '  New name  ');
    const data = await getWorkspaces();

    expect(renamed?.name).toBe('New name');
    expect(data.workspaces[0].name).toBe('New name');
  });

  it('ignores empty rename requests', async () => {
    await fs.writeFile(
      path.join(dataDir, 'workspaces.json'),
      JSON.stringify({
        workspaces: [
          { id: 'ws-one', name: 'Stable name', directories: ['/tmp/project'] },
        ],
        groups: [],
        activeWorkspaceId: 'ws-one',
        sidebarCollapsed: false,
        sidebarWidth: 240,
        updatedAt: new Date(0).toISOString(),
      }),
    );

    const { getWorkspaces, renameWorkspace } = await import('@/lib/workspace-store');

    const renamed = await renameWorkspace('ws-one', '   ');
    const data = await getWorkspaces();

    expect(renamed?.name).toBe('Stable name');
    expect(data.workspaces[0].name).toBe('Stable name');
  });
});
