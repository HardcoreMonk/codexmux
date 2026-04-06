import { memo, useMemo } from 'react';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import { getProcessIcon } from '@/lib/process-icon';
import type { TTabDisplayStatus, TTerminalStatus } from '@/types/status';
import type { TPanelType } from '@/types/terminal';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
}

const NERD_FONT_STYLE = { fontFamily: 'MesloLGLDZ, monospace' };

const TerminalNerdIcon = ({ className, process }: { className: string; process?: string | null }) => (
  <span className={`text-sm leading-none ${className}`} style={NERD_FONT_STYLE} aria-hidden="true">
    {getProcessIcon(process)}
  </span>
);

const DotByStatus = ({ status, panelType, terminalStatus, process }: { status: TTabDisplayStatus; panelType?: TPanelType; terminalStatus?: TTerminalStatus; process?: string | null }) => {
  let inner: React.ReactNode;
  let isNerd = false;

  if (panelType === 'claude-code') {
    if (status === 'busy') {
      inner = <Spinner className="h-2 w-2 text-muted-foreground" />;
    } else if (status === 'ready-for-review' || status === 'needs-input') {
      inner = <span className="h-2 w-2 rounded-full bg-ui-purple animate-pulse" aria-hidden="true" />;
    } else {
      inner = <span className="h-2 w-2 rounded-full border border-muted-foreground/40" aria-hidden="true" />;
    }
  } else if (panelType === 'web-browser') {
    inner = <Globe className="h-2.5 w-2.5 text-muted-foreground/50" aria-hidden="true" />;
  } else if (terminalStatus === 'server') {
    isNerd = true;
    inner = <TerminalNerdIcon className="text-ui-green" process={process} />;
  } else if (terminalStatus === 'running') {
    isNerd = true;
    inner = <TerminalNerdIcon className="text-ui-blue" process={process} />;
  } else {
    isNerd = true;
    inner = <TerminalNerdIcon className="text-muted-foreground/50" process={process} />;
  }

  return (
    <span className={`flex h-3 ${isNerd ? 'w-3.5' : 'w-3'} items-center justify-center`}>
      {inner}
    </span>
  );
};

const WorkspaceStatusIndicator = ({ workspaceId }: IWorkspaceStatusIndicatorProps) => {
  const t = useTranslations('terminal');
  const wsConnected = useTabStore((state) => state.statusWsConnected);
  const tabs = useTabStore((state) => state.tabs);
  const tabOrder = useTabStore((state) => state.tabOrders[workspaceId]);
  const tabEntries = useMemo(() => {
    const wsTabIds = new Set<string>();
    for (const [tabId, entry] of Object.entries(tabs)) {
      if (entry.workspaceId === workspaceId) wsTabIds.add(tabId);
    }

    const ordered = (tabOrder ?? []).filter((id) => wsTabIds.has(id));
    for (const id of wsTabIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    return ordered.map((tabId) => ({
      tabId,
      status: selectTabDisplayStatus(tabs, tabId),
      panelType: tabs[tabId]?.panelType,
      terminalStatus: tabs[tabId]?.terminalStatus,
      currentProcess: tabs[tabId]?.currentProcess,
    }));
  }, [tabs, tabOrder, workspaceId]);

  if (wsConnected && tabEntries.length === 0) return null;

  return (
    <span className="mt-1 flex h-3 items-center gap-0.5" aria-label={t('tabStatus')}>
      {tabEntries.map(({ tabId, status, panelType, terminalStatus, currentProcess }) => (
        <DotByStatus key={tabId} status={status} panelType={panelType} terminalStatus={terminalStatus} process={currentProcess} />
      ))}
    </span>
  );
};

export default memo(WorkspaceStatusIndicator);
