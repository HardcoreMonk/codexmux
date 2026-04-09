import { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  CheckCircle2,
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
import { dismissTab } from '@/hooks/use-claude-status';
import { navigateToTab, useLayoutStore } from '@/hooks/use-layout';
import { findPane } from '@/lib/layout-tree';
import type { ITabState } from '@/hooks/use-tab-store';
import type { ICurrentAction } from '@/types/status';
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

const collectDoneItems = (
  tabs: Record<string, ITabState>,
  workspaces: { id: string; name: string }[],
): INotificationItem[] => {
  const wsMap = new Map(workspaces.map((ws) => [ws.id, ws.name]));
  const items: INotificationItem[] = [];

  for (const [tabId, tab] of Object.entries(tabs)) {
    if (!tab.dismissedAt) continue;
    if (tab.cliState !== 'idle' && tab.cliState !== 'inactive') continue;
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

  items.sort((a, b) => (b.dismissedAt ?? 0) - (a.dismissedAt ?? 0));
  return items;
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

  const doneItems = useMemo(
    () => collectDoneItems(tabs, workspaces),
    [tabs, workspaces],
  );

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

  const isEmpty = busyItems.length === 0 && needsInputItems.length === 0 && reviewItems.length === 0 && doneItems.length === 0;

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

              {doneItems.length > 0 && (
                <section className={busyItems.length > 0 || needsInputItems.length > 0 || reviewItems.length > 0 ? 'mt-4' : ''}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {t('doneSection', { count: doneItems.length })}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {doneItems.map((item) => (
                      <NotificationItem
                        key={item.tabId}
                        item={item}
                        showActions={false}
                        variant="done"
                        isActiveTab={item.tabId === activeTabId}
                        onNavigate={handleNavigate}
                      />
                    ))}
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
