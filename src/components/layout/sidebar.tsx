import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Settings,
  LogOut,
  Bot,
} from 'lucide-react';
import useTabStore from '@/hooks/use-tab-store';
import { useNotificationCount, NotificationPanel } from '@/components/features/terminal/notification-sheet';
import AppLogo from '@/components/layout/app-logo';
import { isMac } from '@/lib/keyboard-shortcuts';
import { useRouter } from 'next/router';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { IWorkspace } from '@/types/terminal';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import WorkspaceItem from '@/components/features/terminal/workspace-item';
import dynamic from 'next/dynamic';

const SettingsDialog = dynamic(
  () => import('@/components/features/terminal/settings-dialog'),
  { ssr: false },
);
import useAgentStore, { selectBlockedCount, selectHasWorkingAgent, selectUnreadCount } from '@/hooks/use-agent-store';
import useConfigStore from '@/hooks/use-config-store';
import { useSelectWorkspace } from '@/hooks/use-sidebar-actions';
import useSidebarItems from '@/hooks/use-sidebar-items';
import useWebviewStore from '@/hooks/use-webview-store';
import IconRenderer from '@/components/features/settings/icon-renderer';
import SidebarRateLimits from '@/components/layout/sidebar-rate-limits';

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

const handleLogout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
};

const Sidebar = () => {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');
  const router = useRouter();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const collapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const width = useWorkspaceStore((s) => s.sidebarWidth);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const hasBusy = useTabStore((s) => {
    for (const t of Object.values(s.tabs)) {
      if (t.cliState === 'busy') return true;
    }
    return false;
  });
  const { attentionCount } = useNotificationCount();
  const blockedCount = useAgentStore(selectBlockedCount);
  const unreadCount = useAgentStore(selectUnreadCount);
  const hasWorkingAgent = useAgentStore(selectHasWorkingAgent);
  const agentEnabled = useConfigStore((s) => s.agentEnabled);
  const selectWorkspace = useSelectWorkspace();
  const { items: sidebarItems } = useSidebarItems();
  const activeWebviewId = useWebviewStore((s) => s.activeId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'workspace' | 'tasks'>(() => {
    if (typeof window === 'undefined') return 'workspace';
    const saved = localStorage.getItem('sidebar-tab');
    return saved === 'tasks' ? 'tasks' : 'workspace';
  });

  const handleSidebarTabChange = useCallback((v: string) => {
    const tab = v as 'workspace' | 'tasks';
    setSidebarTab(tab);
    localStorage.setItem('sidebar-tab', tab);
  }, []);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const modTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (workspaces.length === 0) {
      useWorkspaceStore.getState().fetchWorkspaces();
    }
  }, [workspaces.length]);

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener('open-settings', handler);
    return () => window.removeEventListener('open-settings', handler);
  }, []);

  useEffect(() => {
    const modKey = isMac ? 'Meta' : 'Control';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== modKey || modTimerRef.current) return;
      modTimerRef.current = setTimeout(() => {
        setShowShortcuts(true);
      }, 500);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== modKey) return;
      if (modTimerRef.current) {
        clearTimeout(modTimerRef.current);
        modTimerRef.current = null;
      }
      setShowShortcuts(false);
    };

    const handleBlur = () => {
      if (modTimerRef.current) {
        clearTimeout(modTimerRef.current);
        modTimerRef.current = null;
      }
      setShowShortcuts(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      if (modTimerRef.current) clearTimeout(modTimerRef.current);
    };
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IWorkspace | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set());

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      setIsDragging(true);
      startX.current = e.clientX;
      startWidth.current = width;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = ev.clientX - startX.current;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
        lastWidth = newWidth;
        useWorkspaceStore.getState().setSidebarWidth(newWidth);
      };

      let lastWidth = startWidth.current;

      const handleMouseUp = () => {
        isResizing.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        useWorkspaceStore.getState().saveSidebarWidth(lastWidth);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width],
  );

  const handleCreateWorkspace = useCallback(async () => {
    setIsCreating(true);
    try {
      const ws = await useWorkspaceStore.getState().createWorkspace('');
      if (ws) {
        selectWorkspace(ws.id);
      }
    } finally {
      setIsCreating(false);
    }
  }, [selectWorkspace]);

  const handleDeleteRequest = useCallback(
    (workspaceId: string) => {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (ws) setDeleteTarget(ws);
    },
    [workspaces],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    const { id } = deleteTarget;
    setDeleteTarget(null);
    setDeletingIds((prev) => new Set(prev).add(id));

    const isActive = id === activeWorkspaceId;
    if (isActive) {
      const idx = workspaces.findIndex((w) => w.id === id);
      const adjacent = workspaces[idx + 1] || workspaces[idx - 1];
      if (adjacent) {
        selectWorkspace(adjacent.id);
      }
    }

    const store = useWorkspaceStore.getState();
    const success = await store.deleteWorkspace(id);

    if (!success) {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    setFadingOutIds((prev) => new Set(prev).add(id));
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    store.removeWorkspace(id);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setFadingOutIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (workspaces.length <= 1) {
      store.fetchWorkspaces();
    }
  }, [deleteTarget, activeWorkspaceId, workspaces, selectWorkspace]);

  const handleRename = useCallback(
    (workspaceId: string, name: string) => {
      useWorkspaceStore.getState().renameWorkspace(workspaceId, name);
    },
    [],
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    requestAnimationFrame(() => {
      (e.target as HTMLElement).style.opacity = '0.4';
    });
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '';
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && index !== dragIndex) {
      setDropIndex(index);
    }
  }, [dragIndex]);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      useWorkspaceStore.getState().reorderWorkspaces(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex]);

  const handleToggleCollapse = useCallback(() => {
    useWorkspaceStore.getState().toggleSidebar();
  }, []);

  const isNavActive = (path: string) => router.pathname.startsWith(path);

  return (
    <div className="relative flex shrink-0">
      <div
        className="flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        suppressHydrationWarning
        style={{
          width: isLoading ? 'var(--initial-sb-w, 200px)' : (collapsed ? 0 : width),
          minWidth: isLoading ? 'var(--initial-sb-mw, 160px)' : (collapsed ? 0 : MIN_WIDTH),
          maxWidth: MAX_WIDTH,
          borderRightStyle: collapsed ? 'none' : undefined,
          transition: isDragging ? 'none' : 'width 200ms ease, min-width 200ms ease',
        }}
        role="navigation"
        aria-label={t('workspaceList')}
      >
        <div className="h-titlebar shrink-0" />
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
          <AppLogo shimmer={hasBusy} />
          <div className="flex items-center gap-0.5">
            {agentEnabled && (
              <button
                className={cn(
                  'relative flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-sidebar-accent',
                  isNavActive('/agents') && !activeWebviewId ? 'text-foreground' : hasWorkingAgent ? 'text-ui-teal' : 'text-muted-foreground',
                )}
                onClick={() => { useWebviewStore.getState().hide(); router.push('/agents'); }}
                aria-label={tc('agent')}
              >
                <Bot className={cn('h-3.5 w-3.5', hasWorkingAgent && !isNavActive('/agents') && 'animate-pulse')} />
                {(unreadCount > 0 || blockedCount > 0) && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded px-0.5 text-[9px] font-medium leading-none text-foreground/60 bg-foreground/10">
                    {unreadCount > 0 ? unreadCount : blockedCount}
                  </span>
                )}
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent"
                    aria-label={tc('logout')}
                  />
                }
              >
                <LogOut className="h-3.5 w-3.5" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tc('logout')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tc('logoutConfirm')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLogout}>{tc('logout')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
          <Tabs
            value={sidebarTab}
            onValueChange={handleSidebarTabChange}
            className="gap-0"
          >
            <TabsList className="h-7 w-full">
              <TabsTrigger value="workspace" className="h-full flex-1 px-2.5 text-[11px] tracking-wide">
                WORKSPACE
              </TabsTrigger>
              <TabsTrigger value="tasks" className="h-full flex-1 px-2.5 text-[11px] tracking-wide">
                TASKS
                {attentionCount > 0 && (
                  <span className="ml-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded bg-foreground/10 px-0.5 text-[9px] font-medium leading-none text-foreground/60">
                    {attentionCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {sidebarTab === 'workspace' ? (
          <div
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {!isLoading && workspaces.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-4">
                <span className="text-xs text-muted-foreground">
                  {t('noWorkspaces')}
                </span>
              </div>
            )}

            {workspaces.map((ws, i) => (
              <div
                key={ws.id}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                style={{
                  opacity: fadingOutIds.has(ws.id) ? 0 : undefined,
                  transition: 'opacity 150ms ease-out',
                  borderTop: dropIndex === i && dragIndex !== null && dragIndex > i
                    ? '2px solid var(--focus-indicator)'
                    : undefined,
                  borderBottom: dropIndex === i && dragIndex !== null && dragIndex < i
                    ? '2px solid var(--focus-indicator)'
                    : undefined,
                }}
              >
                <WorkspaceItem
                  workspace={ws}
                  isActive={ws.id === activeWorkspaceId && router.pathname === '/' && !activeWebviewId}
                  isDeleting={deletingIds.has(ws.id)}
                  shortcutLabel={i < 8 ? `⌘${i + 1}` : i === workspaces.length - 1 ? '⌘9' : undefined}
                  showShortcut={showShortcuts}
                  onSelect={selectWorkspace}
                  onRename={handleRename}
                  onDelete={handleDeleteRequest}
                />
              </div>
            ))}
          </div>
        ) : (
          <NotificationPanel className="px-2 pt-2 pb-2" />
        )}

        <div className="shrink-0 border-t border-sidebar-border">
          {sidebarTab === 'workspace' && (
            <button
              className="flex h-9 w-full items-center gap-2 px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent disabled:opacity-50"
              onClick={handleCreateWorkspace}
              disabled={isCreating}
              aria-label={t('addWorkspace')}
            >
              <Plus className="h-3.5 w-3.5" />
              Workspace
            </button>
          )}

          <SidebarRateLimits />

          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-0.5">
              {sidebarItems.map((item) => {
                const isExternal = item.url.startsWith('http://') || item.url.startsWith('https://');
                const isActive = isExternal
                  ? activeWebviewId === item.id
                  : isNavActive(item.url) && !activeWebviewId;
                const shortcutMap: Record<string, string> = {
                  'builtin-notes': isMac ? '⌘⇧E' : '^⇧E',
                  'builtin-stats': isMac ? '⌘⇧U' : '^⇧U',
                };
                const shortcut = shortcutMap[item.id];
                return (
                  <div key={item.id} className="relative">
                    <button
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-sidebar-accent',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                      onClick={() => {
                        if (isExternal) {
                          useWebviewStore.getState().open(item.id, item.url, item.name);
                        } else {
                          useWebviewStore.getState().hide();
                          router.push(item.url);
                        }
                      }}
                      aria-label={item.name}
                      title={item.name}
                    >
                      <IconRenderer name={item.icon} className="h-3.5 w-3.5" />
                    </button>
                    {shortcut && (
                      <span
                        className={cn(
                          'absolute -right-0.5 -top-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium leading-none text-muted-foreground transition-opacity duration-200 pointer-events-none',
                          showShortcuts ? 'opacity-100' : 'opacity-0',
                        )}
                      >
                        {shortcut}
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="relative">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent"
                  onClick={() => setSettingsOpen(true)}
                  aria-label={tc('settings')}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <span
                  className={cn(
                    'absolute -right-0.5 -top-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium leading-none text-muted-foreground transition-opacity duration-200 pointer-events-none',
                    showShortcuts ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {isMac ? '⌘,' : '^,'}
                </span>
              </div>
            </div>
            <div className="relative">
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent"
                onClick={handleToggleCollapse}
                aria-label={t('collapseSidebar')}
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <span
                className={cn(
                  'absolute -right-0.5 -top-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium leading-none text-muted-foreground transition-opacity duration-200 pointer-events-none',
                  showShortcuts ? 'opacity-100' : 'opacity-0',
                )}
              >
                {isMac ? '⌘B' : '^B'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {!collapsed && (
        <div
          className="group relative shrink-0"
          style={{
            width: '6px',
            marginLeft: '-3px',
            marginRight: '-3px',
            cursor: 'col-resize',
            zIndex: 10,
          }}
          onMouseDown={handleResizeStart}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 20 : 4;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const newWidth = Math.max(MIN_WIDTH, width - step);
              useWorkspaceStore.getState().setSidebarWidth(newWidth);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const newWidth = Math.min(MAX_WIDTH, width + step);
              useWorkspaceStore.getState().setSidebarWidth(newWidth);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              useWorkspaceStore.getState().saveSidebarWidth(useWorkspaceStore.getState().sidebarWidth);
            }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          tabIndex={0}
          suppressHydrationWarning
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-muted-foreground/50 group-active:bg-muted-foreground" />
        </div>
      )}

      {collapsed && (
        <div className="flex w-8 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="h-titlebar shrink-0" />
          <button
            className="flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent"
            onClick={handleToggleCollapse}
            aria-label={t('expandSidebar')}
            aria-expanded="false"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {settingsOpen && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteWorkspace')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteWorkspaceConfirm', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ui-red hover:bg-ui-red/80"
              onClick={handleDeleteConfirm}
            >
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Sidebar;
