import { useMemo, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  FilePen,
  FilePlus,
  Terminal,
  Search,
  Users,
  Wrench,
} from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import useTabStore from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTaskHistoryStore from '@/hooks/use-task-history-store';
import { dismissTab } from '@/hooks/use-claude-status';
import { navigateToTab, useLayoutStore } from '@/hooks/use-layout';
import { findPane } from '@/lib/layout-tree';
import type { ITabState } from '@/hooks/use-tab-store';
import type { ICurrentAction } from '@/types/status';
import type { ITaskHistoryEntry } from '@/types/task-history';
import { stripMarkdown } from '@/lib/strip-markdown';

const ACTION_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: FilePen,
  Write: FilePlus,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  Agent: Users,
};


const useActiveTabId = (): string | null => {
  const router = useRouter();
  const isTerminalPage = router.pathname === '/';
  return useLayoutStore((s) => {
    if (!isTerminalPage) return null;
    if (!s.layout?.activePaneId) return null;
    const pane = findPane(s.layout.root, s.layout.activePaneId);
    return pane?.activeTabId ?? null;
  });
};

export const useNotificationCount = (): { busyCount: number; attentionCount: number } => {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useActiveTabId();
  return useMemo(() => {
    let busyCount = 0;
    let attentionCount = 0;
    for (const [tabId, tab] of Object.entries(tabs)) {
      if (tabId === activeTabId) continue;
      if (tab.cliState === 'busy') busyCount++;
      else if (tab.cliState === 'ready-for-review' || tab.cliState === 'needs-input') attentionCount++;
    }
    return { busyCount, attentionCount };
  }, [tabs, activeTabId]);
};

interface INotificationItem {
  tabId: string;
  workspaceName: string;
  workspaceId: string;
  lastUserMessage?: string | null;
  lastAssistantMessage?: string | null;
  currentAction?: ICurrentAction | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
  dismissedAt?: number | null;
}

interface INotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const collectItems = (
  tabs: Record<string, ITabState>,
  workspaces: { id: string; name: string }[],
  targetState: 'busy' | 'ready-for-review' | 'needs-input',
): INotificationItem[] => {
  const wsMap = new Map(workspaces.map((ws) => [ws.id, ws.name]));
  const items: INotificationItem[] = [];

  for (const [tabId, tab] of Object.entries(tabs)) {
    if (tab.cliState !== targetState) continue;
    items.push({
      tabId,
      workspaceName: wsMap.get(tab.workspaceId) || tab.workspaceId,
      workspaceId: tab.workspaceId,
      lastUserMessage: tab.lastUserMessage,
      lastAssistantMessage: tab.lastAssistantMessage,
      currentAction: tab.currentAction,
      readyForReviewAt: tab.readyForReviewAt,
      busySince: tab.busySince,
      dismissedAt: tab.dismissedAt,
    });
  }

  items.sort((a, b) => {
    const ta = a.readyForReviewAt ?? a.busySince ?? 0;
    const tb = b.readyForReviewAt ?? b.busySince ?? 0;
    return tb - ta;
  });

  return items;
};

interface ITabHistoryGroup {
  tabId: string;
  workspaceName: string;
  latestEntry: ITaskHistoryEntry;
  olderEntries: ITaskHistoryEntry[];
}

const groupHistoryByTab = (entries: ITaskHistoryEntry[]): ITabHistoryGroup[] => {
  const tabMap = new Map<string, ITaskHistoryEntry[]>();

  for (const entry of entries) {
    const existing = tabMap.get(entry.tabId);
    if (existing) existing.push(entry);
    else tabMap.set(entry.tabId, [entry]);
  }

  const groups: ITabHistoryGroup[] = [];
  for (const [tabId, tabEntries] of tabMap) {
    tabEntries.sort((a, b) => b.completedAt - a.completedAt);
    groups.push({
      tabId,
      workspaceName: tabEntries[0].workspaceName,
      latestEntry: tabEntries[0],
      olderEntries: tabEntries.slice(1),
    });
  }

  groups.sort((a, b) => b.latestEntry.completedAt - a.latestEntry.completedAt);
  return groups;
};

const formatHistoryTime = (ts: number): string => {
  const d = dayjs(ts);
  const now = dayjs();
  if (d.isAfter(now.startOf('day'))) return d.format('HH:mm');
  if (d.isAfter(now.subtract(1, 'day').startOf('day'))) return d.format('HH:mm');
  return d.format('M/D HH:mm');
};




const TaskHistoryItem = ({
  entry,
  isTabOpen,
  onNavigate,
}: {
  entry: ITaskHistoryEntry;
  isTabOpen: boolean;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}) => {
  const t = useTranslations('notification');

  const durationText = useMemo(() => {
    const minutes = Math.round(entry.duration / 60000);
    if (minutes < 1) return t('durationUnderMinute');
    return t('durationMinutes', { count: minutes });
  }, [entry.duration, t]);

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (entry.touchedFiles.length > 0) {
      parts.push(t('filesModified', { count: entry.touchedFiles.length }));
    }
    const total = Object.values(entry.toolUsage).reduce((a, b) => a + b, 0);
    if (total > 0 && entry.touchedFiles.length === 0) {
      parts.push(t('toolCalls', { count: total }));
    }
    return parts.join(' · ');
  }, [entry.touchedFiles, entry.toolUsage, t]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
        isTabOpen
          ? 'border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-foreground/20 cursor-pointer'
          : 'border-border/30 bg-muted/20 cursor-default opacity-60',
      )}
      onClick={isTabOpen ? () => onNavigate?.(entry.workspaceId, entry.tabId) : undefined}
    >
      <span className="mt-1 shrink-0">
        <CheckCircle2 className={cn('h-3.5 w-3.5', entry.dismissedAt ? 'text-muted-foreground' : 'text-muted-foreground/50')} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {entry.workspaceName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground/60">
            {formatHistoryTime(entry.completedAt)}
          </span>
        </div>
        {entry.prompt && (
          <p className="mt-0.5 truncate text-sm text-foreground">
            {stripMarkdown(entry.prompt)}
          </p>
        )}
        {entry.result && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground/50">
            {stripMarkdown(entry.result)}
          </p>
        )}
        <p className="mt-0.5 truncate text-xs text-muted-foreground/50">
          {durationText}
          {summaryText && ` · ${summaryText}`}
        </p>
      </div>
    </div>
  );
};

const NotificationItem = ({
  item,
  showActions,
  variant,
  isActiveTab,
  onDismiss,
  onNavigate,
}: {
  item: INotificationItem;
  showActions: boolean;
  variant?: 'needs-input' | 'done';
  isActiveTab?: boolean;
  onDismiss?: (tabId: string) => void;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}) => {
  const t = useTranslations('notification');
  const action = item.currentAction;

  const renderAction = () => {
    if (!action) return showActions ? null : t('starting');
    const IconComponent = action.toolName ? ACTION_ICONS[action.toolName] ?? Wrench : null;
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        {IconComponent && <IconComponent size={11} className="shrink-0 text-muted-foreground/40" />}
        <span className="truncate">{action.summary}</span>
      </span>
    );
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
        isActiveTab
          ? 'border-claude-active/30 bg-claude-active/10'
          : 'border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-foreground/20 cursor-pointer',
      )}
      onClick={isActiveTab ? undefined : () => onNavigate?.(item.workspaceId, item.tabId)}
    >
      <span className="mt-1 shrink-0">
        {variant === 'done' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/50" />
        ) : variant === 'needs-input' ? (
          <span className="block h-2 w-2 rounded-full bg-ui-amber animate-pulse" />
        ) : showActions ? (
          <span className="mt-px block h-2 w-2 rounded-full bg-claude-active" />
        ) : (
          <Spinner className="h-3.5 w-3.5 text-claude-active/70" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {item.workspaceName}
          </span>
          {(item.dismissedAt || item.readyForReviewAt || item.busySince) && (
            <span className="shrink-0 text-xs text-muted-foreground/60">
              {dayjs(item.dismissedAt ?? item.readyForReviewAt ?? item.busySince).fromNow()}
            </span>
          )}
        </div>
        {item.lastUserMessage && (
          <p className="mt-0.5 truncate text-sm text-foreground">
            {stripMarkdown(item.lastUserMessage)}
          </p>
        )}
        {variant === 'done' ? (
          item.lastAssistantMessage && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/50">
              {stripMarkdown(item.lastAssistantMessage)}
            </p>
          )
        ) : !variant && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground/60">
            {renderAction()}
          </p>
        )}
        {showActions && !isActiveTab && (
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onDismiss?.(item.tabId); }}
            >
              <Check className="mr-1 h-3 w-3" />
              {t('dismiss')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const NotificationSheet = ({ open, onOpenChange }: INotificationSheetProps) => {
  const t = useTranslations('notification');
  const tabs = useTabStore((s) => s.tabs);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeTabId = useActiveTabId();
  const historyEntries = useTaskHistoryStore((s) => s.entries);
  const [expandedTabs, setExpandedTabs] = useState<Set<string>>(new Set());

  const busyItems = useMemo(
    () => collectItems(tabs, workspaces, 'busy'),
    [tabs, workspaces],
  );

  const needsInputItems = useMemo(
    () => collectItems(tabs, workspaces, 'needs-input'),
    [tabs, workspaces],
  );

  const reviewItems = useMemo(
    () => collectItems(tabs, workspaces, 'ready-for-review'),
    [tabs, workspaces],
  );

  const tabGroups = useMemo(
    () => groupHistoryByTab(historyEntries),
    [historyEntries],
  );

  const toggleExpanded = useCallback((tabId: string) => {
    setExpandedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  }, []);

  const handleDismiss = useCallback((tabId: string) => {
    dismissTab(tabId);
  }, []);

  const handleNavigate = useCallback(
    (workspaceId: string, tabId: string) => {
      navigateToTab(workspaceId, tabId);
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const isEmpty = busyItems.length === 0 && needsInputItems.length === 0 && reviewItems.length === 0 && tabGroups.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showCloseButton={false} className="w-80 sm:max-w-80">
        <div className="h-titlebar shrink-0" />
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'none' }}>
          {isEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <>
              {busyItems.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('busySection', { count: busyItems.length })}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {busyItems.map((item) => (
                      <NotificationItem
                        key={item.tabId}
                        item={item}
                        showActions={false}
                        isActiveTab={item.tabId === activeTabId}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {needsInputItems.length > 0 && (
                <section className={busyItems.length > 0 ? 'mt-4' : ''}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('needsInputSection', { count: needsInputItems.length })}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {needsInputItems.map((item) => (
                      <NotificationItem
                        key={item.tabId}
                        item={item}
                        showActions={false}
                        variant="needs-input"
                        isActiveTab={item.tabId === activeTabId}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {reviewItems.length > 0 && (
                <section className={busyItems.length > 0 || needsInputItems.length > 0 ? 'mt-4' : ''}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('reviewSection', { count: reviewItems.length })}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {reviewItems.map((item) => (
                      <NotificationItem
                        key={item.tabId}
                        item={item}
                        showActions
                        isActiveTab={item.tabId === activeTabId}
                        onDismiss={handleDismiss}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {tabGroups.length > 0 && (
                <section className={busyItems.length > 0 || needsInputItems.length > 0 || reviewItems.length > 0 ? 'mt-4' : ''}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('doneSection', { count: historyEntries.length })}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {tabGroups.map((group) => {
                      const isExpanded = expandedTabs.has(group.tabId);
                      const hasOlder = group.olderEntries.length > 0;
                      return (
                        <div key={group.tabId}>
                          <TaskHistoryItem
                            entry={group.latestEntry}
                            isTabOpen={group.tabId in tabs}
                            onNavigate={handleNavigate}
                          />
                          {hasOlder && (
                            <button
                              type="button"
                              className="mt-1 flex w-full items-center gap-1 px-1 py-0.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                              onClick={() => toggleExpanded(group.tabId)}
                            >
                              <ChevronRight className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')} />
                              {isExpanded ? t('showLess') : t('showMore', { count: group.olderEntries.length })}
                            </button>
                          )}
                          {isExpanded && (
                            <div className="mt-1 flex flex-col gap-1.5 border-l border-border/30 ml-2 pl-2">
                              {group.olderEntries.map((entry) => (
                                <TaskHistoryItem
                                  key={entry.id}
                                  entry={entry}
                                  isTabOpen={group.tabId in tabs}
                                  onNavigate={handleNavigate}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationSheet;
