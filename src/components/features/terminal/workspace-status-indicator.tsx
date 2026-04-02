import { useMemo, memo } from 'react';
import { Loader2, Globe } from 'lucide-react';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import { getProcessIcon } from '@/lib/process-icon';
import type { TTabDisplayStatus, TTerminalStatus } from '@/types/status';
import type { TPanelType } from '@/types/terminal';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
}

const NERD_FONT_STYLE = { fontFamily: 'MesloLGLDZ, monospace' };

const TerminalNerdIcon = ({ className, process }: { className: string; process?: string | null }) => (
  <span className={`text-[10px] leading-none ${className}`} style={NERD_FONT_STYLE} aria-hidden="true">
    {getProcessIcon(process)}
  </span>
);

const DotByStatus = ({ status, panelType, terminalStatus, process }: { status: TTabDisplayStatus; panelType?: TPanelType; terminalStatus?: TTerminalStatus; process?: string | null }) => {
  let inner: React.ReactNode;

  if (panelType === 'claude-code') {
    if (status === 'busy') {
      inner = <Loader2 className="h-2 w-2 animate-spin text-muted-foreground" aria-hidden="true" />;
    } else if (status === 'needs-attention' || status === 'needs-input') {
      inner = <span className="h-2 w-2 rounded-full bg-ui-purple animate-pulse" aria-hidden="true" />;
    } else {
      inner = <span className="h-2 w-2 rounded-full border border-muted-foreground/40" aria-hidden="true" />;
    }
  } else if (panelType === 'web-browser') {
    inner = <Globe className="h-2.5 w-2.5 text-muted-foreground/50" aria-hidden="true" />;
  } else if (terminalStatus === 'server') {
    inner = <TerminalNerdIcon className="text-ui-green animate-pulse" process={process} />;
  } else if (terminalStatus === 'running') {
    inner = <TerminalNerdIcon className="text-ui-blue" process={process} />;
  } else {
    inner = <TerminalNerdIcon className="text-muted-foreground/50" process={process} />;
  }

  return (
    <span className="flex h-3 w-3 items-center justify-center">
      {inner}
    </span>
  );
};

const WorkspaceStatusIndicator = ({ workspaceId }: IWorkspaceStatusIndicatorProps) => {
  const tabs = useTabStore((state) => state.tabs);
  const tabOrder = useTabStore((state) => state.tabOrders[workspaceId]);
  const wsConnected = useTabStore((state) => state.statusWsConnected);
  const metadata = useTabMetadataStore((state) => state.metadata);

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

    return ordered.map((tabId) => {
      const meta = metadata[tabId];
      return {
        tabId,
        status: selectTabDisplayStatus(tabs, tabId),
        panelType: tabs[tabId]?.panelType,
        terminalStatus: tabs[tabId]?.terminalStatus,
        process: meta?.currentProcess ?? meta?.title,
      };
    });
  }, [tabs, tabOrder, workspaceId, metadata]);

  if (wsConnected && tabEntries.length === 0) return null;

  return (
    <span className="mt-1 flex h-3 items-center gap-0.5" aria-label="탭 상태">
      {tabEntries.map(({ tabId, status, panelType, terminalStatus, process }) => (
        <DotByStatus key={tabId} status={status} panelType={panelType} terminalStatus={terminalStatus} process={process} />
      ))}
    </span>
  );
};

export default memo(WorkspaceStatusIndicator);
