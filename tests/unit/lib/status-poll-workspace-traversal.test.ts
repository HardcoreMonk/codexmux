import { describe, expect, it, vi } from 'vitest';

import { collectStatusPollWorkspaceTabs } from '@/lib/status/poll-workspace-traversal';
import type { ILayoutData, IWorkspace } from '@/types/terminal';

const workspaces: IWorkspace[] = [
  { id: 'ws-a', name: 'A', directories: ['/a'] },
  { id: 'ws-missing', name: 'Missing', directories: ['/missing'] },
  { id: 'ws-b', name: 'B', directories: ['/b'] },
];

const layout = (...ids: string[]): ILayoutData => ({
  activePaneId: 'pane-a',
  updatedAt: '2026-05-06T00:00:00.000Z',
  root: {
    type: 'pane',
    id: 'pane-a',
    activeTabId: ids[0] ?? null,
    tabs: ids.map((id, order) => ({
      id,
      order,
      name: id,
      sessionName: `session-${id}`,
    })),
  },
});

describe('status poll workspace traversal', () => {
  it('collects ordered poll tab rows while skipping missing layouts', async () => {
    const readLayout = vi.fn(async (workspaceId: string) => {
      if (workspaceId === 'ws-a') return layout('tab-a1', 'tab-a2');
      if (workspaceId === 'ws-b') return layout('tab-b1');
      return null;
    });

    const result = await collectStatusPollWorkspaceTabs({ workspaces, readLayout });

    expect(readLayout).toHaveBeenCalledTimes(3);
    expect(result.workspaceCount).toBe(3);
    expect(result.scannedTabCount).toBe(3);
    expect(result.workspaceTabs.map(({ workspaceId, tab }) => `${workspaceId}:${tab.id}`)).toEqual([
      'ws-a:tab-a1',
      'ws-a:tab-a2',
      'ws-b:tab-b1',
    ]);
    expect([...result.knownTabIds]).toEqual(['tab-a1', 'tab-a2', 'tab-b1']);
  });
});
