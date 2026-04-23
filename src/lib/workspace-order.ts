import type { IWorkspace, IWorkspaceGroup } from '@/types/terminal';

export const getVisuallyOrderedWorkspaces = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
): IWorkspace[] => {
  const validGroupIds = new Set(groups.map((g) => g.id));
  const byGroup = new Map<string, IWorkspace[]>();
  const ungrouped: IWorkspace[] = [];

  for (const ws of workspaces) {
    const gid = ws.groupId ?? null;
    if (gid && validGroupIds.has(gid)) {
      const list = byGroup.get(gid) ?? [];
      list.push(ws);
      byGroup.set(gid, list);
    } else {
      ungrouped.push(ws);
    }
  }

  const ordered: IWorkspace[] = [];
  for (const g of groups) {
    const list = byGroup.get(g.id);
    if (list) ordered.push(...list);
  }
  ordered.push(...ungrouped);
  return ordered;
};
