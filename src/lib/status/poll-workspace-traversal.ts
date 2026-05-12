import { collectAllTabs } from '@/lib/layout-store';
import type { ILayoutData, ITab, IWorkspace } from '@/types/terminal';

interface ICollectStatusPollWorkspaceTabsInput {
  workspaces: IWorkspace[];
  readLayout: (workspaceId: string) => Promise<ILayoutData | null>;
}

interface IStatusPollWorkspaceTab {
  workspaceId: string;
  tab: ITab;
}

interface IStatusPollWorkspaceTraversal {
  workspaceCount: number;
  scannedTabCount: number;
  knownTabIds: Set<string>;
  workspaceTabs: IStatusPollWorkspaceTab[];
}

export const collectStatusPollWorkspaceTabs = async ({
  workspaces,
  readLayout,
}: ICollectStatusPollWorkspaceTabsInput): Promise<IStatusPollWorkspaceTraversal> => {
  const knownTabIds = new Set<string>();
  const workspaceTabs: IStatusPollWorkspaceTab[] = [];

  for (const workspace of workspaces) {
    const layout = await readLayout(workspace.id);
    if (!layout) continue;

    for (const tab of collectAllTabs(layout.root)) {
      knownTabIds.add(tab.id);
      workspaceTabs.push({ workspaceId: workspace.id, tab });
    }
  }

  return {
    workspaceCount: workspaces.length,
    scannedTabCount: workspaceTabs.length,
    knownTabIds,
    workspaceTabs,
  };
};
