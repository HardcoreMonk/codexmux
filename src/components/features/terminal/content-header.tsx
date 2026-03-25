import { useState } from 'react';
import { Equal, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TLayoutNode, TPanelType } from '@/types/terminal';
import { collectPanes } from '@/hooks/use-layout';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import isElectron from '@/hooks/use-is-electron';

const SplitVerticalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

const SplitHorizontalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

interface IContentHeaderProps {
  activePaneId: string | null;
  root: TLayoutNode;
  paneCount: number;
  canSplit: boolean;
  isSplitting: boolean;
  onSplitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => void;
  onEqualizeRatios: () => void;
  onUpdateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
}

const ContentHeader = ({
  activePaneId,
  root,
  paneCount,
  canSplit,
  isSplitting,
  onSplitPane,
  onEqualizeRatios,
  onUpdateTabPanelType,
}: IContentHeaderProps) => {
  const [isToggling, setIsToggling] = useState(false);

  const panes = collectPanes(root);
  const focusedPane = panes.find((p) => p.id === activePaneId) ?? panes[0];
  const activeTab = focusedPane?.tabs.find((t) => t.id === focusedPane.activeTabId);
  const activePanelType: TPanelType = activeTab?.panelType ?? 'terminal';

  const activeTabCwd = useTabMetadataStore(
    (state) => (activeTab?.id ? state.metadata[activeTab.id]?.cwd : undefined),
  );

  const editorUrl = useWorkspaceStore((state) => state.editorUrl);

  const handlePanelSwitch = (value: string) => {
    if (isToggling || !focusedPane || !activeTab) return;
    const next = value as TPanelType;
    if (next === activePanelType) return;
    setIsToggling(true);
    onUpdateTabPanelType(focusedPane.id, activeTab.id, next);
    setTimeout(() => setIsToggling(false), 150);
  };

  const paneId = focusedPane?.id;

  return (
    <div className="shrink-0 border-b border-border bg-background">
      {isElectron && (
        <div className="h-7" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      )}
      <div className="flex h-12 items-center justify-between px-3">
      <div />
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Tabs
            value={activePanelType}
            onValueChange={handlePanelSwitch}
            className={cn('gap-0 border-r border-border pr-2', isToggling && 'pointer-events-none opacity-80')}
          >
            <TabsList className="h-7">
              <TabsTrigger value="terminal" className="h-full px-2.5 text-[11px] tracking-wide">
                TERMINAL
              </TabsTrigger>
              <TabsTrigger value="claude-code" className="h-full px-2.5 text-[11px] tracking-wide">
                CLAUDE
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            className="flex h-7 items-center border-r border-border pr-2 pl-1 text-[11px] font-medium tracking-wide text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (!editorUrl) {
                toast.info('에디터 URL이 설정되지 않았습니다. 설정 > 에디터에서 URL을 입력해주세요.');
                return;
              }
              const folder = activeTabCwd || '/';
              const separator = editorUrl.includes('?') ? '&' : '?';
              const url = `${editorUrl}${separator}folder=${encodeURIComponent(folder)}`;
              window.open(url, '_blank');
            }}
            aria-label="code-server 열기"
          >
            EDITOR
            <ExternalLink className="-mt-0.5 ml-1 h-3 w-3" />
          </button>

          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-7 w-7 items-center justify-center text-muted-foreground',
                canSplit
                  ? 'hover:text-foreground'
                  : 'cursor-not-allowed opacity-30',
              )}
              onClick={canSplit && paneId ? () => onSplitPane(paneId, 'horizontal') : undefined}
              disabled={!canSplit}
              aria-label="수직 분할"
            >
              {isSplitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SplitVerticalIcon className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">수직 분할</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-7 w-7 items-center justify-center text-muted-foreground',
                canSplit
                  ? 'hover:text-foreground'
                  : 'cursor-not-allowed opacity-30',
              )}
              onClick={canSplit && paneId ? () => onSplitPane(paneId, 'vertical') : undefined}
              disabled={!canSplit}
              aria-label="수평 분할"
            >
              {isSplitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SplitHorizontalIcon className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">수평 분할</TooltipContent>
          </Tooltip>

          {paneCount >= 2 && (
            <Tooltip>
              <TooltipTrigger
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={onEqualizeRatios}
                aria-label="균등 분할"
              >
                <Equal className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom">균등 분할</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
      </div>
    </div>
  );
};

export default ContentHeader;
