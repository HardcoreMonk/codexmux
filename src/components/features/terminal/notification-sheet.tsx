import { useMemo, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
import { navigateToTab, navigateToTabOrCreate, useLayoutStore } from '@/hooks/use-layout';
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


const useActiveTab = (): { id: string | null; claudeSessionId: string | null } => {
  const router = useRouter();
  const isTerminalPage = router.pathname === '/';
  return useLayoutStore(useShallow((s) => {
    if (!isTerminalPage) return { id: null, claudeSessionId: null };
    if (!s.layout?.activePaneId) return { id: null, claudeSessionId: null };
    const pane = findPane(s.layout.root, s.layout.activePaneId);
    if (!pane?.activeTabId) return { id: null, claudeSessionId: null };
    const tab = pane.tabs.find((t) => t.id === pane.activeTabId);
    return { id: pane.activeTabId, claudeSessionId: tab?.claudeSessionId ?? null };
  }));
};

export const useNotificationCount = (): { busyCount: number; attentionCount: number } => {
  const tabs = useTabStore((s) => s.tabs);
  const { id: activeTabId } = useActiveTab();
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

interface ISessionHistoryGroup {
  sessionId: string;
  tabId: string;
  workspaceName: string;
  latestEntry: ITaskHistoryEntry;
  olderEntries: ITaskHistoryEntry[];
}

const groupHistoryBySession = (entries: ITaskHistoryEntry[]): ISessionHistoryGroup[] => {
  const sessionMap = new Map<string, ITaskHistoryEntry[]>();

  for (const entry of entries) {
    const key = entry.claudeSessionId ?? entry.id;
    const existing = sessionMap.get(key);
    if (existing) existing.push(entry);
    else sessionMap.set(key, [entry]);
  }

  const groups: ISessionHistoryGroup[] = [];
  for (const [sessionId, sessionEntries] of sessionMap) {
    sessionEntries.sort((a, b) => b.completedAt - a.completedAt);
    groups.push({
      sessionId,
      tabId: sessionEntries[0].tabId,
      workspaceName: sessionEntries[0].workspaceName,
      latestEntry: sessionEntries[0],
      olderEntries: sessionEntries.slice(1),
    });
  }

  groups.sort((a, b) => b.latestEntry.completedAt - a.latestEntry.completedAt);
  return groups;
};

type TDateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

const groupSessionsByDate = (groups: ISessionHistoryGroup[]): { group: TDateGroup; sessions: ISessionHistoryGroup[] }[] => {
  const now = dayjs();
  const todayStart = now.startOf('day');
  const yesterdayStart = todayStart.subtract(1, 'day');
  const weekStart = todayStart.subtract(6, 'day');

  const buckets: Record<TDateGroup, ISessionHistoryGroup[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  for (const sg of groups) {
    const time = dayjs(sg.latestEntry.completedAt);
    if (time.isAfter(todayStart)) buckets.today.push(sg);
    else if (time.isAfter(yesterdayStart)) buckets.yesterday.push(sg);
    else if (time.isAfter(weekStart)) buckets.thisWeek.push(sg);
    else buckets.older.push(sg);
  }

  return (['today', 'yesterday', 'thisWeek', 'older'] as TDateGroup[])
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ group: g, sessions: buckets[g] }));
};

const formatNotificationTime = (ts: number): string => {
  const d = dayjs(ts);
  const now = dayjs();
  if (now.diff(d, 'minute') < 60) return d.fromNow();
  if (d.isAfter(now.startOf('day'))) return d.format('HH:mm');
  return d.format('M/D HH:mm');
};




const TaskHistoryItem = ({
  entry,
  isActiveSession,
  compact,
  onClick,
}: {
  entry: ITaskHistoryEntry;
  isActiveSession?: boolean;
  compact?: boolean;
  onClick?: () => void;
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

  if (compact) {
    return (
      <div
        className="rounded px-2 py-1.5 transition-colors hover:bg-muted/40 cursor-pointer"
        onClick={onClick}
      >
        <div className="flex items-center justify-between gap-2">
          {entry.prompt ? (
            <p className="truncate text-xs text-foreground/70">
              {stripMarkdown(entry.prompt)}
            </p>
          ) : (
            <span />
          )}
          <span className="shrink-0 text-xs text-muted-foreground/40">
            {formatNotificationTime(entry.completedAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground/40">
          {durationText}
          {summaryText && ` · ${summaryText}`}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
        'border-border/50 hover:border-foreground/20',
        isActiveSession
          ? 'bg-claude-active/10'
          : 'bg-muted/30 hover:bg-muted/50 cursor-pointer',
      )}
      onClick={isActiveSession ? undefined : onClick}
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
            {formatNotificationTime(entry.completedAt)}
          </span>
        </div>
        {entry.prompt && (
          <p className={cn('mt-0.5 truncate text-sm', isActiveSession ? 'text-foreground' : 'text-muted-foreground')}>
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
        'border-border/50 hover:border-foreground/20',
        isActiveTab
          ? 'bg-claude-active/10'
          : 'bg-muted/30 hover:bg-muted/50 cursor-pointer',
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
              {formatNotificationTime(item.dismissedAt ?? item.readyForReviewAt ?? item.busySince ?? Date.now())}
            </span>
          )}
        </div>
        {item.lastUserMessage && (
          <p className={cn('mt-0.5 truncate text-sm', isActiveTab ? 'text-foreground' : 'text-muted-foreground')}>
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
  const { id: activeTabId, claudeSessionId: activeClaudeSessionId } = useActiveTab();
  const historyEntries = useTaskHistoryStore((s) => s.entries);
  const sessionTabMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [tabId, tab] of Object.entries(tabs)) {
      if (tab.claudeSessionId) map.set(tab.claudeSessionId, tabId);
    }
    return map;
  }, [tabs]);
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

  const sessionGroups = useMemo(
    () => groupHistoryBySession(historyEntries),
    [historyEntries],
  );

  const dateGroups = useMemo(
    () => groupSessionsByDate(sessionGroups),
    [sessionGroups],
  );

  const toggleExpanded = useCallback((sessionId: string) => {
    setExpandedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
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

  const handleHistoryClick = useCallback(
    (entry: ITaskHistoryEntry, resolvedTabId: string | null) => {
      onOpenChange(false);
      if (resolvedTabId) {
        navigateToTab(entry.workspaceId, resolvedTabId);
      } else {
        navigateToTabOrCreate(
          entry.workspaceId,
          entry.tabId,
          entry.claudeSessionId,
          entry.workspaceName,
          entry.workspaceDir,
        );
      }
    },
    [onOpenChange],
  );

  const isEmpty = busyItems.length === 0 && needsInputItems.length === 0 && reviewItems.length === 0 && dateGroups.length === 0;

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

              {dateGroups.length > 0 && (
                <section className={busyItems.length > 0 || needsInputItems.length > 0 || reviewItems.length > 0 ? 'mt-4' : ''}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('doneSection', { count: historyEntries.length >= 200 ? '200+' : historyEntries.length })}
                  </h3>
                  {dateGroups.map(({ group: dateGroup, sessions }) => (
                    <div key={dateGroup}>
                      <h4 className="mb-1.5 mt-3 first:mt-0 text-xs text-muted-foreground/60">
                        {t(`dateGroup_${dateGroup}`)}
                      </h4>
                      <div className="flex flex-col gap-2">
                        {sessions.map((group) => {
                          const isExpanded = expandedTabs.has(group.sessionId);
                          const hasOlder = group.olderEntries.length > 0;
                          const isActive = activeClaudeSessionId !== null && group.sessionId === activeClaudeSessionId;
                          const resolvedTabId = sessionTabMap.get(group.sessionId) ?? null;
                          return (
                            <div key={group.sessionId}>
                              <TaskHistoryItem
                                entry={group.latestEntry}
                                isActiveSession={isActive}
                                onClick={() => handleHistoryClick(group.latestEntry, resolvedTabId)}
                              />
                              {hasOlder && (
                                <button
                                  type="button"
                                  className="mt-1 flex w-full items-center gap-1 py-0.5 pl-9 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                  onClick={() => toggleExpanded(group.sessionId)}
                                >
                                  <ChevronRight className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')} />
                                  {isExpanded ? t('showLess') : t('showMore', { count: group.olderEntries.length })}
                                </button>
                              )}
                              {isExpanded && (
                                <div className="mt-1 flex flex-col border-l border-border/30 ml-5 pl-2">
                                  {group.olderEntries.map((entry) => (
                                    <TaskHistoryItem
                                      key={entry.id}
                                      entry={entry}
                                      compact
                                      onClick={() => handleHistoryClick(entry, resolvedTabId)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
