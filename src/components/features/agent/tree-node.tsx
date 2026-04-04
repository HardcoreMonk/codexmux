import { memo, useCallback } from 'react';
import { ChevronRight, FileText, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IMemoryNode } from '@/types/memory';

const FILE_ICON_COLORS: Record<string, string> = {
  'config.md': 'text-ui-blue',
  'learnings.md': 'text-ui-teal',
  'context.md': 'text-ui-purple',
  'index.md': 'text-ui-coral',
  'user.md': 'text-ui-pink',
};

interface ITreeNodeProps {
  node: IMemoryNode;
  level: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onFileSelect: (path: string) => void;
  onToggleDir: (path: string) => void;
}

const TreeNode = ({
  node,
  level,
  selectedPath,
  expandedPaths,
  onFileSelect,
  onToggleDir,
}: ITreeNodeProps) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const indent = level * 16;

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      onToggleDir(node.path);
    } else {
      onFileSelect(node.path);
    }
  }, [node.type, node.path, onToggleDir, onFileSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  if (node.type === 'directory') {
    return (
      <div role="treeitem" aria-expanded={isExpanded} aria-selected={false}>
        <div
          className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 hover:bg-muted/50"
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <ChevronRight
            size={12}
            className={cn('shrink-0 transition-transform', isExpanded && 'rotate-90')}
          />
          <Folder size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{node.name}</span>
        </div>

        {isExpanded && node.children && (
          <div role="group">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                level={level + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onFileSelect={onFileSelect}
                onToggleDir={onToggleDir}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const iconColor = FILE_ICON_COLORS[node.name] ?? 'text-muted-foreground';

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 hover:bg-muted/50',
        isSelected && 'bg-accent text-accent-foreground',
      )}
      style={{ paddingLeft: `${24 + indent}px` }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <FileText size={14} className={cn('shrink-0', iconColor)} />
      <span className="truncate text-sm">{node.name}</span>
    </div>
  );
};

export default memo(TreeNode);
