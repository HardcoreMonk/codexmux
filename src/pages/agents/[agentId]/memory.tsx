import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useTranslations } from 'next-intl';
import { FileText, FolderTree, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { getPageShellWithTitlebarLayout } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MemoryTree from '@/components/features/agent/memory-tree';
import MemoryViewer from '@/components/features/agent/memory-viewer';
import MemoryStats from '@/components/features/agent/memory-stats';
import useAgentStore from '@/hooks/use-agent-store';
import type {
  IMemoryNode,
  IMemoryTreeResponse,
  IMemoryFileResponse,
  IMemorySearchResponse,
  IMemorySearchResult,
  IRecentMemoryFile,
} from '@/types/memory';

interface IPageState {
  tree: IMemoryNode[];
  stats: IMemoryTreeResponse['stats'];
  recentFiles: IRecentMemoryFile[];
  isTreeLoading: boolean;
  treeError: string | null;

  selectedPath: string | null;
  fileContent: string | null;
  fileSizeBytes: number | null;
  fileModifiedAt: string | null;
  isFileLoading: boolean;
  fileError: string | null;

  isEditing: boolean;
  isSaving: boolean;

  searchQuery: string;
  searchResults: IMemorySearchResult[] | null;
  isSearching: boolean;
}

const initialState: IPageState = {
  tree: [],
  stats: { totalFiles: 0, totalSizeBytes: 0, agentFiles: 0, agentSizeBytes: 0 },
  recentFiles: [],
  isTreeLoading: true,
  treeError: null,

  selectedPath: null,
  fileContent: null,
  fileSizeBytes: null,
  fileModifiedAt: null,
  isFileLoading: false,
  fileError: null,

  isEditing: false,
  isSaving: false,

  searchQuery: '',
  searchResults: null,
  isSearching: false,
};

const TreeSkeleton = () => (
  <div className="space-y-2 px-3 py-3">
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-2">
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3" style={{ width: `${60 + i * 15}px` }} />
      </div>
    ))}
  </div>
);

const TreeErrorState = ({ onRetry, message }: { onRetry: () => void; message: string }) => {
  const tc = useTranslations('common');
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <FileText className="h-8 w-8 text-negative/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {tc('retry')}
      </Button>
    </div>
  );
};

const MemoryPage = () => {
  const t = useTranslations('agents');
  const tc = useTranslations('common');
  const router = useRouter();
  const agentId = router.query.agentId as string;

  const agent = useAgentStore((s) => (agentId ? s.agents[agentId] ?? null : null));
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const isStoreLoading = useAgentStore((s) => s.isLoading);

  const [state, setState] = useState<IPageState>(initialState);
  const [mobileTab, setMobileTab] = useState<'tree' | 'viewer'>('tree');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!agent && agentId) fetchAgents();
  }, [agent, agentId, fetchAgents]);

  const fetchTree = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, isTreeLoading: true, treeError: null }));
    try {
      const res = await fetch(`/api/agent/${id}/memory`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: IMemoryTreeResponse = await res.json();
      setState((prev) => ({
        ...prev,
        tree: data.tree,
        stats: data.stats,
        recentFiles: data.recentFiles,
        isTreeLoading: false,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isTreeLoading: false,
        treeError: t('memoryLoadError'),
      }));
    }
  }, [t]);

  useEffect(() => {
    if (agentId) fetchTree(agentId);
  }, [agentId, fetchTree]);

  const fetchFile = useCallback(async (filePath: string) => {
    setState((prev) => ({
      ...prev,
      selectedPath: filePath,
      isFileLoading: true,
      fileError: null,
      isEditing: false,
    }));
    try {
      const res = await fetch(`/api/agent/memory/file?path=${encodeURIComponent(filePath)}`);
      if (res.status === 404) {
        setState((prev) => ({
          ...prev,
          isFileLoading: false,
          fileError: t('fileDeleted'),
          fileContent: null,
        }));
        if (agentId) fetchTree(agentId);
        return;
      }
      if (!res.ok) throw new Error('Failed');
      const data: IMemoryFileResponse = await res.json();
      setState((prev) => ({
        ...prev,
        fileContent: data.content,
        fileSizeBytes: data.sizeBytes,
        fileModifiedAt: data.modifiedAt,
        isFileLoading: false,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isFileLoading: false,
        fileError: t('fileReadError'),
      }));
    }
  }, [agentId, fetchTree, t]);

  const handleFileSelect = useCallback(
    (filePath: string) => {
      fetchFile(filePath);
      setMobileTab('viewer');
    },
    [fetchFile],
  );

  const handleEdit = useCallback(() => {
    setState((prev) => ({ ...prev, isEditing: true }));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setState((prev) => ({ ...prev, isEditing: false }));
  }, []);

  const handleSave = useCallback(
    async (content: string) => {
      if (!state.selectedPath) return;

      const prevContent = state.fileContent;
      const prevMeta = { sizeBytes: state.fileSizeBytes, modifiedAt: state.fileModifiedAt };

      setState((prev) => ({
        ...prev,
        isEditing: false,
        isSaving: true,
        fileContent: content,
      }));

      try {
        const res = await fetch('/api/agent/memory/file', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: state.selectedPath, content }),
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          isSaving: false,
          fileModifiedAt: data.modifiedAt,
          fileSizeBytes: new Blob([content]).size,
        }));
        toast.success(tc('saved'));
      } catch {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          isEditing: true,
          fileContent: prevContent,
          fileSizeBytes: prevMeta.sizeBytes,
          fileModifiedAt: prevMeta.modifiedAt,
        }));
        toast.error(t('saveFailed'));
      }
    },
    [state.selectedPath, state.fileContent, state.fileSizeBytes, state.fileModifiedAt, t, tc],
  );

  const handleRetryFile = useCallback(() => {
    if (state.selectedPath) fetchFile(state.selectedPath);
  }, [state.selectedPath, fetchFile]);

  const handleRetryTree = useCallback(() => {
    if (agentId) fetchTree(agentId);
  }, [agentId, fetchTree]);

  const handleSearchChange = useCallback(
    (query: string) => {
      setState((prev) => ({ ...prev, searchQuery: query }));

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      if (query.length < 2) {
        setState((prev) => ({ ...prev, searchResults: null, isSearching: false }));
        return;
      }

      setState((prev) => ({ ...prev, isSearching: true }));

      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/agent/${agentId}/memory/search?q=${encodeURIComponent(query)}`,
          );
          if (!res.ok) throw new Error('Search failed');
          const data: IMemorySearchResponse = await res.json();
          setState((prev) => ({
            ...prev,
            searchResults: data.results,
            isSearching: false,
          }));
        } catch {
          setState((prev) => ({ ...prev, isSearching: false }));
          toast.error(t('searchError'));
        }
      }, 300);
    },
    [agentId, t],
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  if (!agentId) return null;

  const showTreeLoading = state.isTreeLoading || (isStoreLoading && !agent);
  const title = agent ? t('memoryPageTitle', { name: agent.name }) : t('memoryDefaultTitle');
  const agentName = agent?.name ?? agentId;

  const content = (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{agentName}</span>
            {agent?.role && (
              <span className="text-[10px] text-muted-foreground">{agent.role}</span>
            )}
          </div>

          <span className="text-xs text-muted-foreground">{t('memory')}</span>
        </div>

        <div className="flex border-b md:hidden">
          <button
            type="button"
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs ${mobileTab === 'tree' ? 'border-b-2 border-foreground font-medium text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setMobileTab('tree')}
          >
            <FolderTree size={14} />
            {t('tree')}
          </button>
          <button
            type="button"
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs ${mobileTab === 'viewer' ? 'border-b-2 border-foreground font-medium text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setMobileTab('viewer')}
          >
            <Eye size={14} />
            {t('viewer')}
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={`${mobileTab === 'tree' ? 'flex' : 'hidden'} w-full flex-col overflow-hidden md:flex md:w-64 md:shrink-0 md:border-r`}>
            {showTreeLoading && <TreeSkeleton />}
            {!showTreeLoading && state.treeError && <TreeErrorState onRetry={handleRetryTree} message={state.treeError} />}
            {!showTreeLoading && !state.treeError && (
              <MemoryTree
                tree={state.tree}
                agentId={agentId}
                selectedPath={state.selectedPath}
                onFileSelect={handleFileSelect}
                searchQuery={state.searchQuery}
                onSearchChange={handleSearchChange}
                searchResults={state.searchResults}
                isSearching={state.isSearching}
              />
            )}
          </div>

          <div className={`${mobileTab === 'viewer' ? 'flex' : 'hidden'} flex-1 flex-col overflow-hidden md:flex`}>
            <MemoryViewer
              selectedPath={state.selectedPath}
              content={state.fileContent}
              sizeBytes={state.fileSizeBytes}
              modifiedAt={state.fileModifiedAt}
              isLoading={state.isFileLoading}
              error={state.fileError}
              isEditing={state.isEditing}
              isSaving={state.isSaving}
              onEdit={handleEdit}
              onSave={handleSave}
              onCancelEdit={handleCancelEdit}
              onRetry={handleRetryFile}
            />
          </div>
        </div>

        <MemoryStats
          totalFiles={state.stats.totalFiles}
          totalSizeBytes={state.stats.totalSizeBytes}
          agentFiles={state.stats.agentFiles}
          agentSizeBytes={state.stats.agentSizeBytes}
          agentName={agentName}
          recentFiles={state.recentFiles}
          onFileSelect={handleFileSelect}
        />
    </>
  );

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      {content}
    </>
  );
};

MemoryPage.getLayout = getPageShellWithTitlebarLayout;

export default MemoryPage;
