import { useState, useRef, useCallback, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { IWorkspace } from '@/types/terminal';
import WorkspaceStatusIndicator from '@/components/features/terminal/workspace-status-indicator';

interface IWorkspaceItemProps {
  workspace: IWorkspace;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: (workspaceId: string) => void;
  onRename: (workspaceId: string, name: string) => void;
  onDelete: (workspaceId: string) => void;
}

const WorkspaceItem = ({
  workspace,
  isActive,
  isDeleting,
  onSelect,
  onRename,
  onDelete,
}: IWorkspaceItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(workspace.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    setIsEditing(false);
    if (!trimmed) {
      const dirName = (workspace.directories[0] ?? '').split('/').filter(Boolean).pop() || workspace.name;
      if (dirName !== workspace.name) {
        onRename(workspace.id, dirName);
      }
      setEditValue(dirName);
      return;
    }
    if (trimmed !== workspace.name) {
      onRename(workspace.id, trimmed);
    }
  }, [editValue, workspace.id, workspace.name, workspace.directories, onRename]);

  const cancelRename = useCallback(() => {
    setIsEditing(false);
    setEditValue(workspace.name);
  }, [workspace.name]);

  const startEditing = useCallback(() => {
    setEditValue(workspace.name);
    setIsEditing(true);
  }, [workspace.name]);

  const handleDoubleClick = useCallback(() => {
    startEditing();
  }, [startEditing]);

  const handleClick = useCallback(() => {
    if (!isEditing && !isActive) {
      onSelect(workspace.id);
    }
  }, [isEditing, isActive, onSelect, workspace.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  const displayDirs = workspace.directories
    .map((d) => d.replace(/^\/Users\/[^/]+/, '~'));

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'flex cursor-pointer flex-col justify-center border-l-2 px-3 py-2 transition-colors duration-75',
          'overflow-hidden',
          isActive
            ? 'border-l-ui-purple bg-accent text-foreground'
            : 'border-l-transparent text-muted-foreground hover:bg-sidebar-accent',
        )}
        style={{
          opacity: isDeleting ? 0.5 : 1,
          transition: 'opacity 150ms, background-color 75ms',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="button"
        aria-current={isActive ? 'true' : undefined}
        tabIndex={0}
        render={<div />}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            className="w-full border-b border-accent-color bg-transparent text-sm text-foreground outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitRename}
          />
        ) : (
          <>
            <span className="truncate text-sm font-medium leading-tight">
              {workspace.name}
            </span>
            {displayDirs.map((dir, i) => (
              <span key={dir} className={cn('truncate text-xs leading-tight text-muted-foreground/70', i === 0 && 'mt-1')}>
                {dir}
              </span>
            ))}
            <WorkspaceStatusIndicator workspaceId={workspace.id} />
          </>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={startEditing}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          이름 변경
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-ui-red focus:text-ui-red"
          onClick={() => onDelete(workspace.id)}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          삭제
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default WorkspaceItem;
