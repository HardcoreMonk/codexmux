import { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import TreeNode from '@/components/features/agent/tree-node';
import SearchResults from '@/components/features/agent/search-results';
import type { IMemoryNode, IMemorySearchResult } from '@/types/memory';

interface IMemoryTreeProps {
  tree: IMemoryNode[];
  agentId: string;
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: IMemorySearchResult[] | null;
  isSearching: boolean;
}

const collectDirPaths = (nodes: IMemoryNode[], target: string): string[] => {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      if (node.name === target || node.name === 'shared') {
        paths.push(node.path);
        if (node.children) {
          for (const child of node.children) {
            if (child.type === 'directory') {
              paths.push(child.path);
            }
          }
        }
      }
    }
  }
  return paths;
};

const MemoryTree = ({
  tree,
  agentId,
  selectedPath,
  onFileSelect,
  searchQuery,
  onSearchChange,
  searchResults,
  isSearching,
}: IMemoryTreeProps) => {
  const t = useTranslations('agent');
  const defaultExpanded = useMemo(() => new Set(collectDirPaths(tree, agentId)), [tree, agentId]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(defaultExpanded);

  useEffect(() => {
    setExpandedPaths(defaultExpanded);
  }, [defaultExpanded]);

  const handleToggleDir = useCallback((dirPath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    onSearchChange('');
  }, [onSearchChange]);

  const treeRef = useRef<HTMLDivElement>(null);

  const handleTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();

    const container = treeRef.current;
    if (!container) return;

    const items = Array.from(container.querySelectorAll<HTMLElement>('[tabindex="0"]'));
    if (items.length === 0) return;

    const currentIdx = items.indexOf(document.activeElement as HTMLElement);
    let nextIdx: number;

    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
    }

    items[nextIdx]?.focus();
  }, []);

  const isSearchMode = searchQuery.length >= 2;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2" role="search">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            size={1}
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-7 pr-7 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={handleClearSearch}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isSearching && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">{t('searching')}</div>
        )}

        {isSearchMode && !isSearching && searchResults && (
          <SearchResults results={searchResults} query={searchQuery} onFileSelect={onFileSelect} />
        )}

        {!isSearchMode && (
          <div role="tree" ref={treeRef} onKeyDown={handleTreeKeyDown}>
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                level={0}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                agentId={agentId}
                onFileSelect={onFileSelect}
                onToggleDir={handleToggleDir}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MemoryTree);
