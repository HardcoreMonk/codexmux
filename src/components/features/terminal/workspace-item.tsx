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
      setEditValue(workspace.name);
      return;
    }
    if (trimmed !== workspace.name) {
      onRename(workspace.id, trimmed);
    }
  }, [editValue, workspace.id, workspace.name, onRename]);

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

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'flex h-9 cursor-pointer items-center px-3 text-sm transition-colors duration-75',
          'overflow-hidden text-ellipsis whitespace-nowrap',
        )}
        style={{
          backgroundColor: isActive
            ? 'oklch(0.20 0.008 286)'
            : undefined,
          borderLeft: isActive
            ? '2px solid oklch(0.71 0.051 289)'
            : '2px solid transparent',
          opacity: isDeleting ? 0.5 : 1,
          color: isActive
            ? 'oklch(0.87 0.006 286)'
            : 'oklch(0.63 0.006 286)',
          transition: 'opacity 150ms, background-color 75ms',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              'oklch(0.18 0.006 286)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.backgroundColor = '';
          }
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
            className="w-full bg-transparent text-sm outline-none"
            style={{
              borderBottom: '1px solid oklch(0.69 0.056 243.5)',
              color: 'oklch(0.87 0.006 286)',
            }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitRename}
          />
        ) : (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {workspace.name}
          </span>
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
