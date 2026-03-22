import { useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import useClaudeStatusStore, { getGlobalStatus, getTabStatus } from '@/hooks/use-claude-status-store';
import { dismissTab } from '@/hooks/use-claude-status';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useLayoutStore, collectPanes } from '@/hooks/use-layout';
import useIsMobile from '@/hooks/use-is-mobile';
import type { TTabDisplayStatus } from '@/types/status';

interface ISessionItem {
  tabId: string;
  tabName: string;
  workspaceId: string;
  workspaceName: string;
  status: TTabDisplayStatus;
}

const activateTabInLayout = (tabId: string): boolean => {
  const layout = useLayoutStore.getState().layout;
  if (!layout) return false;
  const panes = collectPanes(layout.root);
  for (const pane of panes) {
    if (pane.tabs.some((t) => t.id === tabId)) {
      useLayoutStore.getState().switchTabInPane(pane.id, tabId);
      useLayoutStore.getState().focusPane(pane.id);
      return true;
    }
  }
  return false;
};

const GlobalStatusSummary = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isMobile = useIsMobile();
  const listRef = useRef<HTMLDivElement>(null);

  const tabs = useClaudeStatusStore((state) => state.tabs);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const { busyCount, attentionCount } = useMemo(
    () => getGlobalStatus(tabs),
    [tabs],
  );

  const sessions = useMemo(() => {
    const wsMap = new Map(workspaces.map((ws) => [ws.id, ws.name]));
    return Object.entries(tabs)
      .reduce<ISessionItem[]>((acc, [tabId, entry]) => {
        const status = getTabStatus(tabs, tabId);
        if (status !== 'idle') {
          acc.push({
            tabId,
            tabName: entry.tabName,
            workspaceId: entry.workspaceId,
            workspaceName: wsMap.get(entry.workspaceId) ?? entry.workspaceId,
            status,
          });
        }
        return acc;
      }, [])
      .sort((a, b) => {
        if (a.status === 'needs-attention' && b.status === 'busy') return -1;
        if (a.status === 'busy' && b.status === 'needs-attention') return 1;
        return a.workspaceName.localeCompare(b.workspaceName);
      });
  }, [tabs, workspaces]);

  const handleSessionClick = useCallback(
    (tabId: string, workspaceId: string) => {
      dismissTab(tabId);

      const currentWsId = useWorkspaceStore.getState().activeWorkspaceId;
      const needsSwitch = currentWsId !== workspaceId;

      if (needsSwitch) {
        useWorkspaceStore.getState().switchWorkspace(workspaceId);
      }

      if (router.pathname !== '/') {
        router.push('/');
      }

      if (!needsSwitch) {
        activateTabInLayout(tabId);
      } else {
        const unsub = useLayoutStore.subscribe((state) => {
          if (state.layout && !state.isLoading) {
            activateTabInLayout(tabId);
            unsub();
          }
        });
        setTimeout(unsub, 5000);
      }

      setOpen(false);
    },
    [router],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!items?.length) return;

    const idx = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown'
      ? Math.min(idx + 1, items.length - 1)
      : Math.max(idx - 1, 0);

    items[next]?.focus();
    items[next]?.scrollIntoView({ block: 'nearest' });
  }, []);

  const shouldClose = open && sessions.length === 0;
  const effectiveOpen = open && !shouldClose;

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && sessions.length === 0) return;
    setOpen(nextOpen);
  }, [sessions.length]);

  if (busyCount === 0 && attentionCount === 0) return null;

  const ariaLabel = [
    busyCount > 0 ? `${busyCount}개 실행 중` : '',
    attentionCount > 0 ? `${attentionCount}개 확인 필요` : '',
  ].filter(Boolean).join(', ');

  return (
    <Popover open={effectiveOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            className={cn(
              'flex cursor-pointer items-center text-xs text-muted-foreground transition-colors hover:text-foreground',
              isMobile && 'gap-1.5',
            )}
            aria-label={ariaLabel}
            aria-haspopup="true"
          />
        }
      >
        {isMobile ? (
          <>
            {busyCount > 0 && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            )}
            {attentionCount > 0 && (
              <span className="flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-ui-red" aria-hidden="true" />
                <span className="font-medium">{attentionCount}</span>
              </span>
            )}
          </>
        ) : (
          <>
            {busyCount > 0 && (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>
                  <span className="font-medium">{busyCount}</span> 실행 중
                </span>
              </span>
            )}
            {busyCount > 0 && attentionCount > 0 && (
              <span className="mx-1.5 text-muted-foreground/50" aria-hidden="true">
                ·
              </span>
            )}
            {attentionCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-ui-red" aria-hidden="true" />
                <span>
                  <span className="font-medium">{attentionCount}</span> 확인 필요
                </span>
              </span>
            )}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 max-h-64 gap-0 overflow-y-auto p-1">
        <div
          ref={listRef}
          role="listbox"
          aria-label="Claude 세션 목록"
          onKeyDown={handleKeyDown}
        >
          {sessions.map((session) => (
            <button
              key={session.tabId}
              role="option"
              aria-selected={false}
              className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              onClick={() => handleSessionClick(session.tabId, session.workspaceId)}
            >
              <span className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center">
                {session.status === 'busy' ? (
                  <Loader2
                    className="h-3 w-3 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-ui-red"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{session.tabName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {session.workspaceName}
                </span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default GlobalStatusSummary;
