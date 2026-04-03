import { useMemo, useCallback } from 'react';
import { Loader2, ArrowRight, Check } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import useTabStore, { selectGlobalStatus } from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { dismissTab } from '@/hooks/use-claude-status';
import type { ITabState } from '@/hooks/use-tab-store';

dayjs.extend(relativeTime);
dayjs.locale('ko');

interface INotificationItem {
  tabId: string;
  workspaceName: string;
  workspaceId: string;
  lastUserMessage?: string | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
}

interface INotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}

const collectItems = (
  tabs: Record<string, ITabState>,
  workspaces: { id: string; name: string }[],
  targetState: 'busy' | 'ready-for-review',
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
      readyForReviewAt: tab.readyForReviewAt,
      busySince: tab.busySince,
    });
  }

  return items;
};

const NotificationItem = ({
  item,
  showActions,
  onDismiss,
  onNavigate,
}: {
  item: INotificationItem;
  showActions: boolean;
  onDismiss?: (tabId: string) => void;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}) => (
  <div className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5">
    <span className="mt-1 shrink-0">
      {showActions ? (
        <span className="block h-2 w-2 rounded-full bg-ui-purple" />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {item.workspaceName}
        </span>
        {(item.readyForReviewAt || item.busySince) && (
          <span className="shrink-0 text-xs text-muted-foreground/60">
            {dayjs(item.readyForReviewAt ?? item.busySince).fromNow()}
          </span>
        )}
      </div>
      {item.lastUserMessage && (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {item.lastUserMessage}
        </p>
      )}
      {showActions && (
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onDismiss?.(item.tabId)}
          >
            <Check className="mr-1 h-3 w-3" />
            확인
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onNavigate?.(item.workspaceId, item.tabId)}
          >
            <ArrowRight className="mr-1 h-3 w-3" />
            이동
          </Button>
        </div>
      )}
    </div>
  </div>
);

const NotificationSheet = ({ open, onOpenChange, onNavigate }: INotificationSheetProps) => {
  const tabs = useTabStore((s) => s.tabs);
  const busyCount = useTabStore((s) => selectGlobalStatus(s.tabs).busyCount);
  const attentionCount = useTabStore((s) => selectGlobalStatus(s.tabs).attentionCount);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const busyItems = useMemo(
    () => collectItems(tabs, workspaces, 'busy'),
    [tabs, workspaces],
  );

  const reviewItems = useMemo(
    () => collectItems(tabs, workspaces, 'ready-for-review'),
    [tabs, workspaces],
  );

  const handleDismiss = useCallback((tabId: string) => {
    dismissTab(tabId);
  }, []);

  const handleNavigate = useCallback(
    (workspaceId: string, tabId: string) => {
      onNavigate?.(workspaceId, tabId);
      window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { workspaceId, tabId } }));
      onOpenChange(false);
    },
    [onNavigate, onOpenChange],
  );

  const isEmpty = busyCount === 0 && attentionCount === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showCloseButton={false} className="w-80 sm:max-w-80">
        <SheetHeader>
          <SheetTitle>알림</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'none' }}>
          {isEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              진행중인 작업이 없습니다
            </p>
          ) : (
            <>
              {busyItems.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    진행중 ({busyCount})
                  </h3>
                  <div className="flex flex-col gap-2">
                    {busyItems.map((item) => (
                      <NotificationItem
                        key={item.tabId}
                        item={item}
                        showActions={false}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {reviewItems.length > 0 && (
                <section className={busyItems.length > 0 ? 'mt-4' : ''}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    리뷰 ({attentionCount})
                  </h3>
                  <div className="flex flex-col gap-2">
                    {reviewItems.map((item) => (
                      <NotificationItem
                        key={item.tabId}
                        item={item}
                        showActions
                        onDismiss={handleDismiss}
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
