import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import useClaudeStatusStore, { getTabStatus } from '@/hooks/use-claude-status-store';
import type { TTabDisplayStatus } from '@/types/status';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
}

const DotByStatus = ({ status }: { status: TTabDisplayStatus }) => {
  if (status === 'busy') {
    return (
      <span className="flex h-3 w-3 items-center justify-center">
        <Loader2
          className="h-2 w-2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </span>
    );
  }

  if (status === 'needs-attention') {
    return (
      <span className="flex h-3 w-3 items-center justify-center">
        <span
          className="h-2 w-2 rounded-full bg-ui-purple"
          aria-hidden="true"
        />
      </span>
    );
  }

  return (
    <span className="flex h-3 w-3 items-center justify-center">
      <span
        className="h-2 w-2 rounded-full border border-muted-foreground/40"
        aria-hidden="true"
      />
    </span>
  );
};

const WorkspaceStatusIndicator = ({ workspaceId }: IWorkspaceStatusIndicatorProps) => {
  const tabs = useClaudeStatusStore((state) => state.tabs);
  const tabOrder = useClaudeStatusStore((state) => state.tabOrders[workspaceId]);

  const tabEntries = useMemo(() => {
    const statusTabIds = new Set<string>();
    for (const [tabId, entry] of Object.entries(tabs)) {
      if (entry.workspaceId === workspaceId) statusTabIds.add(tabId);
    }

    const ordered = tabOrder
      ? tabOrder.filter((id) => statusTabIds.has(id))
      : [];
    for (const id of statusTabIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    return ordered.map((tabId) => ({
      tabId,
      status: getTabStatus(tabs, tabId),
    }));
  }, [tabs, tabOrder, workspaceId]);

  if (tabEntries.length === 0) return null;

  return (
    <span className="mt-1 flex h-3 items-center gap-0.5" aria-label="탭 상태">
      {tabEntries.map(({ tabId, status }) => (
        <DotByStatus key={tabId} status={status} />
      ))}
    </span>
  );
};

export default WorkspaceStatusIndicator;
