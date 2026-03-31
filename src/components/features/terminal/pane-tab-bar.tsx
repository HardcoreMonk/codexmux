import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Terminal,
  Globe,
} from 'lucide-react';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ITab, TPanelType } from '@/types/terminal';
import { isAutoTabName } from '@/lib/tab-title';
import TabStatusIndicator from '@/components/features/terminal/tab-status-indicator';
import useConfigStore from '@/hooks/use-config-store';

interface IPaneTabBarProps {
  paneId: string;
  tabs: ITab[];
  activeTabId: string | null;
  tabTitles?: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  paneCount: number;
  isSplitting: boolean;
  onSwitchTab: (tabId: string) => void;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => void;
  onDeleteTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onReorderTabs: (tabIds: string[]) => void;
  onClosePane: () => void;
  onMoveTab: (tabId: string, fromPaneId: string, toIndex: number) => void;
  onFocusPane: () => void;
  onRetry: () => void;
}

const PaneTabBar = ({
  paneId,
  tabs,
  activeTabId,
  tabTitles,
  isLoading,
  error,
  isCreating,
  paneCount,
  isSplitting,
  onSwitchTab,
  onCreateTab,
  onDeleteTab,
  onRenameTab,
  onReorderTabs,
  onClosePane,
  onMoveTab,
  onFocusPane,
  onRetry,
}: IPaneTabBarProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const hasOverflow = showLeftArrow || showRightArrow;
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    side: 'left' | 'right';
  } | null>(null);
  const [isDragOverFromOther, setIsDragOverFromOther] = useState(false);
  const dragEnterCountRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [newTabOpen, setNewTabOpen] = useState(false);

  const sortedTabs = useMemo(() => [...tabs].sort((a, b) => a.order - b.order), [tabs]);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 0);
    setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkOverflow, tabs]);

  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(
      `[data-tab-id="${activeTabId}"]`,
    );
    activeEl?.scrollIntoView({ behavior: 'instant', inline: 'nearest', block: 'nearest' });
  }, [activeTabId]);

  useEffect(() => {
    if (editingTabId) {
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editingTabId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta = e.deltaY || e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
      checkOverflow();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [checkOverflow]);

  const scrollBy = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const startEditing = (tab: ITab) => {
    setEditingTabId(tab.id);
    setEditName(tab.name);
  };

  const confirmRename = (tabId: string) => {
    const trimmed = editName.trim();
    setEditingTabId(null);
    if (!trimmed) {
      const maxNum = tabs
        .map((t) => t.name)
        .filter((n) => /^Terminal \d+$/.test(n))
        .map((n) => parseInt(n.replace('Terminal ', ''), 10))
        .reduce((max, n) => Math.max(max, n), 0);
      onRenameTab(tabId, `Terminal ${maxNum + 1}`);
      return;
    }
    const original = tabs.find((t) => t.id === tabId);
    if (trimmed !== original?.name) {
      onRenameTab(tabId, trimmed);
    }
  };

  const getSourcePaneId = (e: React.DragEvent): string | null => {
    const types = Array.from(e.dataTransfer.types);
    const paneType = types.find((t) => t.startsWith('application/x-pane/'));
    return paneType?.replace('application/x-pane/', '') ?? null;
  };

  const isFromOtherPane = (e: React.DragEvent): boolean => {
    const sourcePaneId = getSourcePaneId(e);
    return sourcePaneId !== null && sourcePaneId !== paneId;
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDropTarget({ id: tabId, side });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current = 0;
    setIsDragOverFromOther(false);

    const draggedId = e.dataTransfer.getData('text/tab-id');
    const sourcePaneId = e.dataTransfer.getData('text/pane-id');

    if (!draggedId) {
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    if (sourcePaneId && sourcePaneId !== paneId) {
      // Cross-pane move
      const toIndex = dropTarget
        ? (() => {
            const targetIdx = sortedTabs.findIndex((t) => t.id === dropTarget.id);
            return dropTarget.side === 'right' ? targetIdx + 1 : targetIdx;
          })()
        : sortedTabs.length;

      onMoveTab(draggedId, sourcePaneId, toIndex);
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    // Same-pane reorder
    if (!dropTarget || draggedId === dropTarget.id) {
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    const newOrder = sortedTabs.filter((t) => t.id !== draggedId);
    const targetIdx = newOrder.findIndex((t) => t.id === dropTarget.id);
    const insertIdx = dropTarget.side === 'right' ? targetIdx + 1 : targetIdx;
    const draggedTab = sortedTabs.find((t) => t.id === draggedId);
    if (draggedTab) {
      newOrder.splice(insertIdx, 0, draggedTab);
    }
    onReorderTabs(newOrder.map((t) => t.id));
    setDraggedTabId(null);
    setDropTarget(null);
  };

  const handleTabBarDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current++;
    if (isFromOtherPane(e)) {
      setIsDragOverFromOther(true);
    }
  };

  const handleTabBarDragLeave = () => {
    dragEnterCountRef.current--;
    if (dragEnterCountRef.current <= 0) {
      dragEnterCountRef.current = 0;
      setIsDragOverFromOther(false);
      setDropTarget(null);
    }
  };

  if (error) {
    return (
      <div className="flex h-[36px] shrink-0 items-center gap-2 bg-background px-3">
        <AlertTriangle className="h-3.5 w-3.5 text-ui-amber" />
        <span className="text-xs text-muted-foreground">{error}</span>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-2 text-xs text-foreground hover:text-foreground"
          onClick={onRetry}
        >
          재시도
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[36px] shrink-0 items-center gap-1.5 bg-background px-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 w-16 animate-pulse rounded bg-muted"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-[36px] shrink-0 items-stretch border-b border-border transition-colors',
        isDragOverFromOther ? 'bg-accent-color/10' : 'bg-background',
      )}
      onDragEnter={handleTabBarDragEnter}
      onDragLeave={handleTabBarDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {hasOverflow && (
        <button
          className={cn(
            'flex w-5 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground',
            showLeftArrow ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => scrollBy(-200)}
          tabIndex={showLeftArrow ? 0 : -1}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        ref={scrollRef}
        role="tablist"
        className="flex flex-1 items-stretch overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        onScroll={checkOverflow}
      >
        {sortedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDragging = tab.id === draggedTabId;
          const isEditing = tab.id === editingTabId;
          const isDropLeft = dropTarget?.id === tab.id && dropTarget.side === 'left';
          const isDropRight = dropTarget?.id === tab.id && dropTarget.side === 'right';
          const dynamicTitle = tabTitles?.[tab.id];
          const displayName = isAutoTabName(tab.name)
            ? (dynamicTitle || tab.name)
            : tab.name;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'group relative flex min-w-[120px] max-w-[180px] cursor-pointer items-center gap-1.5 border-b-2 px-3 text-xs select-none',
                isActive
                  ? 'border-b-accent-color bg-secondary text-foreground'
                  : 'border-b-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                isDragging && 'opacity-30',
              )}
              onClick={() => {
                if (!isEditing && !isActive) onSwitchTab(tab.id);
                onFocusPane();
              }}
              onDoubleClick={() => startEditing(tab)}
              draggable={!isEditing}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/tab-id', tab.id);
                e.dataTransfer.setData('text/pane-id', paneId);
                e.dataTransfer.setData(`application/x-pane/${paneId}`, '');

                const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
                ghost.querySelector('[aria-label="탭 닫기"]')?.remove();
                ghost.querySelectorAll('.sr-only').forEach((el) => el.remove());
                ghost.style.cssText =
                  'position:fixed;left:-9999px;display:flex;align-items:center;gap:6px;padding:4px 12px;background:var(--card);color:var(--foreground);border:none;border-radius:4px;font-size:12px;opacity:0.6;transform:scale(0.9);white-space:nowrap;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());

                setDraggedTabId(tab.id);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={() => {
                setDropTarget(null);
              }}
            >
              {isDropLeft && (
                <div className="absolute top-1 bottom-1 left-0 w-0.5 bg-ui-blue" />
              )}

              {isEditing ? (
                <input
                  ref={inputRef}
                  className="w-full min-w-0 border-b border-accent-color bg-transparent text-xs text-foreground outline-none"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(tab.id);
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                  onBlur={() => confirmRename(tab.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <TabStatusIndicator
                    tabId={tab.id}
                    panelType={tab.panelType}
                  />
                  {tab.panelType === 'claude-code' ? (
                    <ClaudeCodeIcon className="h-3.5 w-3.5" />
                  ) : tab.panelType === 'web-browser' ? (
                    <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      'truncate',
                      displayName ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    {displayName}
                  </span>
                </>
              )}

              <button
                className={cn(
                  'ml-auto -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground',
                  isActive ? 'visible' : 'invisible group-hover:visible',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTab(tab.id);
                }}
                aria-label="탭 닫기"
              >
                <X className="h-3 w-3" />
              </button>

              {isDropRight && (
                <div className="absolute top-1 right-0 bottom-1 w-0.5 bg-ui-blue" />
              )}
            </div>
          );
        })}
      </div>

      {hasOverflow && (
        <button
          className={cn(
            'flex w-5 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground',
            showRightArrow ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => scrollBy(200)}
          tabIndex={showRightArrow ? 0 : -1}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <TooltipProvider>
        <div className="flex shrink-0 items-stretch">
          {/* 탭 추가 */}
          <div className="flex items-center border-l border-r border-border px-0.5">
            <Popover open={newTabOpen} onOpenChange={setNewTabOpen}>
              <PopoverTrigger
                className={cn(
                  'flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground',
                  isCreating && 'pointer-events-none opacity-50',
                )}
                disabled={isCreating}
                aria-label="새 탭"
              >
                {isCreating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-44 gap-0 p-0.5">
                {([
                  { key: 'claude-new', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: 'Claude 새 대화', startClaude: true },
                  { key: 'claude', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-3.5 w-3.5" />, label: 'Claude 세션 목록' },
                  { key: 'terminal', type: 'terminal' as const, icon: <Terminal className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Terminal' },
                  { key: 'web-browser', type: 'web-browser' as const, icon: <Globe className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Web Browser' },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-foreground hover:bg-accent"
                    onClick={() => {
                      setNewTabOpen(false);
                      if ('startClaude' in item && item.startClaude) {
                        const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
                        const settings = '--settings ~/.purplemux/hooks.json';
                        const cmd = dangerous ? `claude ${settings} --dangerously-skip-permissions` : `claude ${settings}`;
                        onCreateTab(item.type, { command: cmd });
                      } else {
                        onCreateTab(item.type);
                      }
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {paneCount >= 2 && (
            <div className="flex items-center px-0.5">
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    'flex h-7 w-7 items-center justify-center text-muted-foreground',
                    isSplitting ? 'pointer-events-none opacity-30' : 'hover:text-foreground',
                  )}
                  disabled={isSplitting}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClosePane();
                  }}
                  aria-label="닫기"
                >
                  <X className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">닫기</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
};

export default PaneTabBar;
