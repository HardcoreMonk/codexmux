import { useState, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  BarChart3,
  FileText,
  Settings,
  X,
} from 'lucide-react';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import { useRouter } from 'next/router';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { IWorkspace, IPaneNode, ITab } from '@/types/terminal';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useTabStore, { selectWorkspacePortsLabel } from '@/hooks/use-tab-store';
import { formatTabTitle, isAutoTabName } from '@/lib/tab-title';
import { getProcessIcon } from '@/lib/process-icon';
import TabStatusIndicator from '@/components/features/terminal/tab-status-indicator';
import WorkspaceStatusIndicator from '@/components/features/terminal/workspace-status-indicator';

const WorkspacePortsLabel = ({ workspaceId }: { workspaceId: string }) => {
  const label = useTabStore(
    (state) => selectWorkspacePortsLabel(state.tabs, workspaceId),
  );
  if (!label) return null;
  return <span className="mt-1 block truncate text-xs text-ui-green/80">{label}</span>;
};

interface IMobileNavigationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  workspaceLayouts: Record<string, IPaneNode[]>;
  activePaneId: string | null;
  activeTabId: string | null;
  onSelectSurface: (workspaceId: string, paneId: string, tabId: string) => void;
  onCreateWorkspace: () => Promise<void>;
  onOpenSettings: () => void;
}

const MobileNavigationSheet = ({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  workspaceLayouts,
  activePaneId,
  activeTabId,
  onSelectSurface,
  onCreateWorkspace,
  onOpenSettings,
}: IMobileNavigationSheetProps) => {
  const router = useRouter();
  const [expandedWsId, setExpandedWsId] = useState<string | null>(activeWorkspaceId);
  const [longPressTabId, setLongPressTabId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadata = useTabMetadataStore((s) => s.metadata);

  const handleToggleWorkspace = useCallback(
    (workspaceId: string) => {
      setExpandedWsId((prev) => (prev === workspaceId ? null : workspaceId));
    },
    [],
  );

  const handleLongPressStart = useCallback((tabId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setLongPressTabId(tabId);
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleSheetOpenChange = useCallback(
    (v: boolean) => {
      onOpenChange(v);
      if (!v) setLongPressTabId(null);
      if (v) setExpandedWsId(activeWorkspaceId);
    },
    [onOpenChange, activeWorkspaceId],
  );

  const getTabDisplayName = (tab: ITab) => {
    const meta = metadata[tab.id];
    const rawTitle = meta?.title || tab.title;
    const formatted = rawTitle ? formatTabTitle(rawTitle) : '';

    if (tab.name && !isAutoTabName(tab.name)) return tab.name;
    if (formatted) return formatted;
    return `Tab ${tab.order + 1}`;
  };

  const tabs = useTabStore((s) => s.tabs);

  const getTabProcessIcon = (tab: ITab) => getProcessIcon(tabs[tab.id]?.currentProcess);

  const getTabNerdColor = (tab: ITab) => {
    const terminalStatus = tabs[tab.id]?.terminalStatus;
    if (terminalStatus === 'server') return 'text-ui-green';
    if (terminalStatus === 'running') return 'text-ui-blue';
    return 'text-muted-foreground/50';
  };

  const renderSurfaceItem = (workspaceId: string, pane: IPaneNode, tab: ITab, indent: string) => {
    const isCurrentWs = workspaceId === activeWorkspaceId;
    const isTabActive = isCurrentWs && pane.id === activePaneId && tab.id === activeTabId;
    const panelType = tab.panelType ?? 'terminal';
    const isClaudeCode = panelType === 'claude-code';

    return (
      <div key={tab.id} className="relative flex items-center">
        <button
          className={cn(
            'flex w-full items-center gap-2 py-2.5 pr-4 text-left text-sm transition-colors',
            indent,
            isTabActive
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
          onClick={() => {
            if (longPressTabId) {
              setLongPressTabId(null);
              return;
            }
            onSelectSurface(workspaceId, pane.id, tab.id);
          }}
          onTouchStart={() => handleLongPressStart(tab.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <TabStatusIndicator
            tabId={tab.id}
            panelType={panelType}
          />
          {isClaudeCode ? (
            <ClaudeCodeIcon size={16} className="mt-0.5" />
          ) : (
            <span
              className={cn('mt-0.5 shrink-0 text-sm leading-none', getTabNerdColor(tab))}
              style={{ fontFamily: 'MesloLGLDZ, monospace' }}
              aria-hidden="true"
            >
              {getTabProcessIcon(tab)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate">{getTabDisplayName(tab)}</span>
            {panelType === 'claude-code' && tab.claudeSummary && (
              <span className="block truncate text-xs text-muted-foreground/70">
                {tab.claudeSummary}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  };

  const renderPaneTree = (workspaceId: string) => {
    const panes = workspaceLayouts[workspaceId] ?? [];
    if (panes.length === 0) return null;

    const isMultiPane = panes.length > 1;

    return panes.map((pane, index) => {
      const sortedTabs = [...pane.tabs].sort((a, b) => a.order - b.order);

      return (
        <div key={pane.id} className="pb-1">
          {isMultiPane && (
            <div className="flex items-center py-1.5 pl-10 pr-2">
              <span className="text-xs text-muted-foreground">
                Pane {index + 1}
              </span>
            </div>
          )}
          {sortedTabs.map((tab) => renderSurfaceItem(workspaceId, pane, tab, 'pl-10'))}
        </div>
      );
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="left" className="w-72 gap-0 p-0" showCloseButton={false}>
        <SheetHeader className="relative flex-row items-center justify-center border-b px-4 py-3">
          <button
            className="absolute left-2 flex h-11 w-11 items-center justify-center text-muted-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="메뉴 닫기"
          >
            <X size={20} />
          </button>
          <SheetTitle className="text-sm font-medium">Workspaces</SheetTitle>
        </SheetHeader>

        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {workspaces.map((ws) => {
            const isExpanded = ws.id === expandedWsId;
            const isActive = ws.id === activeWorkspaceId;
            return (
              <div key={ws.id}>
                <button
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors',
                    isActive
                      ? 'font-medium text-foreground'
                      : 'text-foreground hover:bg-accent/50',
                  )}
                  onClick={() => handleToggleWorkspace(ws.id)}
                >
                  {isExpanded ? (
                    <ChevronDown
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                  ) : (
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">{ws.name}</span>
                    <WorkspacePortsLabel workspaceId={ws.id} />
                    {!isExpanded && (
                      <WorkspaceStatusIndicator workspaceId={ws.id} />
                    )}
                  </div>
                </button>

                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                  style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    {renderPaneTree(ws.id)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t">
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            onClick={onCreateWorkspace}
          >
            <Plus size={16} />
            Workspace
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onOpenChange(false);
              router.push('/reports');
            }}
          >
            <FileText size={16} />
            노트
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onOpenChange(false);
              router.push('/stats');
            }}
          >
            <BarChart3 size={16} />
            통계
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onOpenChange(false);
              onOpenSettings();
            }}
          >
            <Settings size={16} />
            설정
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNavigationSheet;
