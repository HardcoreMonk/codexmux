import { useState, useCallback, useRef } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Settings,
  Info,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import WorkspaceItem from '@/components/features/terminal/workspace-item';
import CreateWorkspaceDialog from '@/components/features/terminal/create-workspace-dialog';

interface ISidebarProps {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  collapsed: boolean;
  width: number;
  isLoading: boolean;
  error: string | null;
  onToggleCollapse: () => void;
  onWidthChange: (width: number) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (directory: string, name?: string) => Promise<IWorkspace | null>;
  onDeleteWorkspace: (workspaceId: string) => Promise<boolean>;
  onRenameWorkspace: (workspaceId: string, name: string) => Promise<boolean>;
  onValidateDirectory: (directory: string) => Promise<{
    valid: boolean;
    error?: string;
    suggestedName?: string;
  }>;
  onRetry: () => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 320;

const Sidebar = ({
  workspaces,
  activeWorkspaceId,
  collapsed,
  width,
  isLoading,
  error,
  onToggleCollapse,
  onWidthChange,
  onSelectWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  onRenameWorkspace,
  onValidateDirectory,
  onRetry,
}: ISidebarProps) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IWorkspace | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      startX.current = e.clientX;
      startWidth.current = width;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = ev.clientX - startX.current;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width, onWidthChange],
  );

  const handleCreateSubmit = useCallback(
    async (directory: string) => {
      const ws = await onCreateWorkspace(directory);
      if (ws) {
        setCreateDialogOpen(false);
        onSelectWorkspace(ws.id);
      }
    },
    [onCreateWorkspace, onSelectWorkspace],
  );

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

    const success = await onDeleteWorkspace(id);

    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (success && workspaces.length <= 1) {
      // Last workspace deleted — server will create a default one,
      // or we let terminal-page handle the empty state
      onRetry();
    }
  }, [deleteTarget, activeWorkspaceId, workspaces, onSelectWorkspace, onDeleteWorkspace, onRetry]);

  const handleRename = useCallback(
    (workspaceId: string, name: string) => {
      onRenameWorkspace(workspaceId, name);
    },
    [onRenameWorkspace],
  );

  return (
    <>
      {/* Sidebar panel */}
      <div
        className="relative flex shrink-0 flex-col overflow-hidden"
        style={{
          width: collapsed ? 0 : width,
          minWidth: collapsed ? 0 : MIN_WIDTH,
          maxWidth: MAX_WIDTH,
          backgroundColor: 'oklch(0.15 0.006 286)',
          borderRight: collapsed ? 'none' : '0.5px solid oklch(0.25 0.006 286)',
          transition: 'width 200ms ease, min-width 200ms ease',
        }}
        role="navigation"
        aria-label="Workspace 목록"
      >
        {/* Header */}
        <div
          className="flex h-9 shrink-0 items-center justify-end px-2"
          style={{ borderBottom: '0.5px solid oklch(0.25 0.006 286 / 0.4)' }}
        >
          <button
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ transition: 'background-color 100ms' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'oklch(0.22 0.006 286)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '';
            }}
            onClick={onToggleCollapse}
            aria-label="사이드바 접기"
            aria-expanded="true"
          >
            <ChevronsLeft className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>

        {/* Workspace list */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {isLoading && (
            <div className="flex flex-col gap-0.5 p-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded"
                  style={{ backgroundColor: 'oklch(0.20 0.006 286)' }}
                />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center gap-2 p-4">
              <AlertTriangle className="h-4 w-4 text-ui-amber" />
              <span className="text-center text-xs text-zinc-500">오류</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onRetry}
              >
                <RefreshCw className="h-3 w-3" />
                재시도
              </Button>
            </div>
          )}

          {!isLoading && !error && workspaces.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-4">
              <span className="text-xs text-zinc-500">
                Workspace가 없습니다
              </span>
            </div>
          )}

          {!isLoading &&
            !error &&
            workspaces.map((ws) => (
              <WorkspaceItem
                key={ws.id}
                workspace={ws}
                isActive={ws.id === activeWorkspaceId}
                isDeleting={deletingIds.has(ws.id)}
                onSelect={onSelectWorkspace}
                onRename={handleRename}
                onDelete={handleDeleteRequest}
              />
            ))}
        </div>

        {/* Footer */}
        <div
          className="shrink-0"
          style={{ borderTop: '0.5px solid oklch(0.25 0.006 286 / 0.15)' }}
        >
          {/* Add button */}
          <button
            className="flex h-9 w-full items-center gap-2 px-3 text-sm text-zinc-400"
            style={{ transition: 'background-color 100ms' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'oklch(0.20 0.006 286)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '';
            }}
            onClick={() => setCreateDialogOpen(true)}
            aria-label="Workspace 추가"
          >
            <Plus className="h-3.5 w-3.5" />
            Workspace
          </button>

          {/* Settings / Info mock */}
          <div className="flex items-center justify-between px-2 pb-2">
            <button
              className="flex h-7 w-7 items-center justify-center rounded"
              style={{ transition: 'background-color 100ms' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  'oklch(0.22 0.006 286)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '';
              }}
              onClick={() => toast.info('추후 구현 예정')}
              aria-label="설정"
            >
              <Settings className="h-3.5 w-3.5 text-zinc-500" />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded"
              style={{ transition: 'background-color 100ms' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  'oklch(0.22 0.006 286)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '';
              }}
              onClick={() => toast.info('추후 구현 예정')}
              aria-label="정보"
            >
              <Info className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="relative shrink-0"
          style={{
            width: '6px',
            marginLeft: '-3px',
            marginRight: '-3px',
            cursor: 'col-resize',
            zIndex: 10,
          }}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
        >
          <div
            className="absolute left-1/2 top-0 h-full -translate-x-1/2"
            style={{
              width: '1px',
              backgroundColor: 'oklch(0.25 0.006 286)',
              transition: 'background-color 100ms',
            }}
          />
        </div>
      )}

      {/* Expand button (collapsed state) */}
      {collapsed && (
        <div
          className="absolute left-0 top-0 z-20 flex h-9 items-center opacity-0 transition-opacity duration-150 hover:opacity-100"
          style={{ paddingLeft: '4px' }}
        >
          <button
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{
              backgroundColor: 'oklch(0.20 0.006 286 / 0.8)',
              transition: 'background-color 100ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'oklch(0.28 0.006 286)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'oklch(0.20 0.006 286 / 0.8)';
            }}
            onClick={onToggleCollapse}
            aria-label="사이드바 펼치기"
            aria-expanded="false"
          >
            <ChevronsRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      )}

      {/* Create dialog */}
      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateSubmit}
        onValidate={onValidateDirectory}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent
          style={{
            backgroundColor: 'oklch(0.18 0.006 286)',
            borderColor: 'oklch(0.30 0.006 286)',
          }}
        >
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
    </>
  );
};

export default Sidebar;
