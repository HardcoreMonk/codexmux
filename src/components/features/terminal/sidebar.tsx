import { useState, useCallback, useRef } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Settings,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { IWorkspace } from '@/types/terminal';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import WorkspaceItem from '@/components/features/terminal/workspace-item';
import SettingsDialog from '@/components/features/terminal/settings-dialog';

interface ISidebarProps {
  onSelectWorkspace: (workspaceId: string) => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

const Sidebar = ({ onSelectWorkspace }: ISidebarProps) => {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const collapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const width = useWorkspaceStore((s) => s.sidebarWidth);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IWorkspace | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set());

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
        onSelectWorkspace(ws.id);
      }
    } finally {
      setIsCreating(false);
    }
  }, [onSelectWorkspace]);

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
        onSelectWorkspace(adjacent.id);
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
  }, [deleteTarget, activeWorkspaceId, workspaces, onSelectWorkspace]);

  const handleRename = useCallback(
    (workspaceId: string, name: string) => {
      useWorkspaceStore.getState().renameWorkspace(workspaceId, name);
    },
    [],
  );

  const handleToggleCollapse = useCallback(() => {
    useWorkspaceStore.getState().toggleSidebar();
  }, []);

  return (
    <div className="relative flex shrink-0">
      <div
        className="flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{
          width: collapsed ? 0 : width,
          minWidth: collapsed ? 0 : MIN_WIDTH,
          maxWidth: MAX_WIDTH,
          borderRightStyle: collapsed ? 'none' : undefined,
          transition: isDragging ? 'none' : 'width 200ms ease, min-width 200ms ease',
        }}
        role="navigation"
        aria-label="Workspace 목록"
      >
        <button
          className="flex h-[30px] w-full shrink-0 items-center justify-end border-b border-sidebar-border px-2 text-muted-foreground transition-colors hover:bg-sidebar-accent"
          onClick={handleToggleCollapse}
          aria-label="사이드바 접기"
          aria-expanded={!collapsed}
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>

        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {workspaces.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-4">
              <span className="text-xs text-muted-foreground">
                Workspace가 없습니다
              </span>
            </div>
          )}

          {workspaces.map((ws) => (
            <div
              key={ws.id}
              style={{
                opacity: fadingOutIds.has(ws.id) ? 0 : undefined,
                transition: 'opacity 150ms ease-out',
              }}
            >
              <WorkspaceItem
                workspace={ws}
                isActive={ws.id === activeWorkspaceId}
                isDeleting={deletingIds.has(ws.id)}
                onSelect={onSelectWorkspace}
                onRename={handleRename}
                onDelete={handleDeleteRequest}
              />
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-sidebar-border">
          <button
            className="flex h-9 w-full items-center gap-2 px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent disabled:opacity-50"
            onClick={handleCreateWorkspace}
            disabled={isCreating}
            aria-label="Workspace 추가"
          >
            <Plus className="h-3.5 w-3.5" />
            Workspace
          </button>

          <div className="flex items-center justify-between px-2 pb-2">
            <button
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent"
              onClick={() => toast.info('추후 구현 예정')}
              aria-label="정보"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
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
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-muted-foreground/50 group-active:bg-muted-foreground" />
        </div>
      )}

      {collapsed && (
        <button
          className="flex shrink-0 items-center border-r border-sidebar-border bg-sidebar px-1 text-muted-foreground transition-colors hover:bg-sidebar-accent"
          onClick={handleToggleCollapse}
          aria-label="사이드바 펼치기"
          aria-expanded="false"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Workspace 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              Workspace &apos;{deleteTarget?.name}&apos;을 닫으시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ui-red hover:bg-ui-red/80"
              onClick={handleDeleteConfirm}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Sidebar;
