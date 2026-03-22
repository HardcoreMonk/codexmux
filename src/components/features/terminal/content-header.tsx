import { useState, useCallback } from 'react';
import { Equal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TLayoutNode, TPanelType } from '@/types/terminal';
import { collectPanes } from '@/hooks/use-layout';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';

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

  const handleToggle = useCallback(() => {
    if (isToggling || !focusedPane || !activeTab) return;
    setIsToggling(true);
    const next: TPanelType = activePanelType === 'terminal' ? 'claude-code' : 'terminal';
    onUpdateTabPanelType(focusedPane.id, activeTab.id, next);
    setTimeout(() => setIsToggling(false), 150);
  }, [isToggling, focusedPane, activeTab, activePanelType, onUpdateTabPanelType]);

  const paneId = focusedPane?.id;

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3">
      <div />
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 border-r border-border pr-2">
            <button
              className={cn(
                'flex h-7 items-center px-2 text-[11px] font-medium tracking-wide text-muted-foreground hover:text-foreground',
                activePanelType === 'claude-code' && 'text-ui-purple',
                isToggling && 'pointer-events-none opacity-80',
              )}
              onClick={handleToggle}
              disabled={isToggling || !activeTab}
              aria-label={activePanelType === 'terminal' ? 'Claude Code 모드로 전환' : '터미널 모드로 전환'}
            >
              CLAUDE
            </button>
            <button
              className="flex h-7 items-center px-2 text-[11px] font-medium tracking-wide text-muted-foreground hover:text-foreground"
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
            </button>
          </div>

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
  );
};

export default ContentHeader;
