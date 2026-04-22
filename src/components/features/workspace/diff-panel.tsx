import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw, GitBranch, Columns2, Rows2, ArrowUp, ArrowDown, ArrowDownUp, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import Spinner from '@/components/ui/spinner';
import useIsMobile from '@/hooks/use-is-mobile';
import DiffHistoryView from '@/components/features/workspace/diff-history-view';
import DiffFileList from '@/components/features/workspace/diff-file-list';

interface IDiffPanelProps {
  sessionName: string;
}

interface IHeadCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  timestamp: number;
}

type TViewMode = 'split' | 'unified';
type TTab = 'changes' | 'history';

const POLL_INTERVAL = 10_000;

const DiffPanel = ({ sessionName }: IDiffPanelProps) => {
  const t = useTranslations('diff');
  const isMobile = useIsMobile();

  const [diff, setDiff] = useState('');
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [branch, setBranch] = useState('');
  const [upstream, setUpstream] = useState<string | null>(null);
  const [isDetached, setIsDetached] = useState(false);
  const [stash, setStash] = useState(0);
  const [headCommit, setHeadCommit] = useState<IHeadCommit | null>(null);
  const [viewMode, setViewMode] = useState<TViewMode>(() => {
    if (typeof window === 'undefined') return 'split';
    const saved = localStorage.getItem('diff-output-format');
    return saved === 'line-by-line' ? 'unified' : 'split';
  });
  const [activeTab, setActiveTab] = useState<TTab>(() => {
    if (typeof window === 'undefined') return 'changes';
    return (localStorage.getItem('diff-active-tab') as TTab) || 'changes';
  });
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const pollTimerRef = useRef(0);
  const currentHashRef = useRef('');

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setHasUpdate(false);
    try {
      const res = await fetch(`/api/layout/diff?session=${sessionName}`);
      if (!res.ok) return;
      const data = await res.json();
      setIsGitRepo(data.isGitRepo);
      if (data.isGitRepo) {
        setDiff(data.diff ?? '');
        setAhead(data.ahead ?? 0);
        setBehind(data.behind ?? 0);
        setBranch(data.branch ?? '');
        setUpstream(data.upstream ?? null);
        setIsDetached(Boolean(data.isDetached));
        setStash(data.stash ?? 0);
        setHeadCommit(data.headCommit ?? null);
        currentHashRef.current = data.hash ?? '';
      }
    } finally {
      setLoading(false);
    }
  }, [sessionName]);

  const pollForChanges = useCallback(async () => {
    try {
      const res = await fetch(`/api/layout/diff?session=${sessionName}&hashOnly=true`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.isGitRepo && data.hash && data.hash !== currentHashRef.current) {
        setHasUpdate(true);
      }
    } catch {
      // ignore
    }
  }, [sessionName]);

  const handleRefresh = useCallback(() => {
    fetchDiff();
    setHistoryRefreshToken((n) => n + 1);
  }, [fetchDiff]);

  const handleTabChange = useCallback((tab: TTab) => {
    setActiveTab(tab);
    localStorage.setItem('diff-active-tab', tab);
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/git/sync?session=${sessionName}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(t('syncErrorGeneric'));
        return;
      }

      if (data.ok) {
        const { pulled, pushed } = data.summary ?? { pulled: 0, pushed: 0 };
        if (pulled === 0 && pushed === 0) {
          toast.success(t('syncUpToDate'));
        } else {
          const parts: string[] = [];
          if (pulled > 0) parts.push(`↓${pulled}`);
          if (pushed > 0) parts.push(`↑${pushed}`);
          toast.success(`${t('syncSuccess')} · ${parts.join(' ')}`);
        }
      } else {
        const kind = data.errorKind ?? 'unknown';
        const messageKey = (
          kind === 'no-upstream' ? 'syncErrorNoUpstream' :
          kind === 'auth' ? 'syncErrorAuth' :
          kind === 'diverged' ? 'syncErrorDiverged' :
          kind === 'rejected' ? 'syncErrorRejected' :
          kind === 'timeout' ? 'syncErrorTimeout' :
          'syncErrorGeneric'
        ) as 'syncErrorNoUpstream' | 'syncErrorAuth' | 'syncErrorDiverged' | 'syncErrorRejected' | 'syncErrorTimeout' | 'syncErrorGeneric';
        toast.error(t(messageKey));
      }

      fetchDiff();
      setHistoryRefreshToken((n) => n + 1);
    } catch {
      toast.error(t('syncErrorGeneric'));
    } finally {
      setSyncing(false);
    }
  }, [sessionName, syncing, t, fetchDiff]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  useEffect(() => {
    if (isGitRepo === false) return;

    pollTimerRef.current = window.setInterval(pollForChanges, POLL_INTERVAL);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') pollForChanges();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isGitRepo, pollForChanges]);

  if (loading && isGitRepo === null) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (isGitRepo === false) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <GitBranch className="h-10 w-10 opacity-20" />
          <span className="text-sm">{t('notGitRepo')}</span>
        </div>
      </div>
    );
  }

  const tabButtonClass = (tab: TTab) =>
    cn(
      'rounded px-2 py-0.5 text-xs font-medium transition-colors',
      activeTab === tab
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );

  const branchLabel = isDetached && headCommit
    ? `(detached @ ${headCommit.shortHash})`
    : branch || '—';

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded bg-secondary p-0.5">
            <button
              type="button"
              className={tabButtonClass('changes')}
              onClick={() => handleTabChange('changes')}
            >
              {t('tabChanges')}
            </button>
            <button
              type="button"
              className={tabButtonClass('history')}
              onClick={() => handleTabChange('history')}
            >
              {t('tabHistory')}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {hasUpdate && activeTab === 'changes' && (
              <span className="text-xs text-ui-blue">{t('hasChanges')}</span>
            )}

            {activeTab === 'changes' && !isMobile && (
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setViewMode((m) => {
                  const next: TViewMode = m === 'split' ? 'unified' : 'split';
                  localStorage.setItem('diff-output-format', next === 'unified' ? 'line-by-line' : 'side-by-side');
                  return next;
                })}
                title={viewMode === 'split' ? t('lineByLine') : t('sideBySide')}
              >
                {viewMode === 'split' ? <Rows2 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
              </button>
            )}

            <button
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={handleSync}
              disabled={syncing || loading}
              title={syncing ? t('syncing') : t('sync')}
            >
              {syncing
                ? <Spinner className="h-3.5 w-3.5" />
                : <ArrowDownUp className="h-3.5 w-3.5" />}
            </button>

            <button
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded',
                hasUpdate && activeTab === 'changes'
                  ? 'text-ui-blue hover:bg-accent'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                loading && 'animate-spin',
              )}
              onClick={handleRefresh}
              disabled={loading}
              title={t('refresh')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-xs">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate font-medium text-foreground" title={branchLabel}>
              {branchLabel}
            </span>
            {upstream && (
              <span className="shrink-0 text-muted-foreground">→</span>
            )}
            {upstream && (
              <span className="truncate text-muted-foreground" title={upstream}>
                {upstream}
              </span>
            )}
          </div>

          {(ahead > 0 || behind > 0) && (
            <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
              {ahead > 0 && (
                <span className="flex items-center gap-0.5 text-ui-blue" title={`${ahead} commit(s) to push`}>
                  <ArrowUp className="h-3 w-3" />
                  {ahead}
                </span>
              )}
              {behind > 0 && (
                <span className="flex items-center gap-0.5 text-claude-active" title={`${behind} commit(s) to pull`}>
                  <ArrowDown className="h-3 w-3" />
                  {behind}
                </span>
              )}
            </div>
          )}

          {stash > 0 && (
            <span
              className="flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground"
              title={`${stash} stash(es)`}
            >
              <Archive className="h-3 w-3" />
              {stash}
            </span>
          )}
        </div>

      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'history' ? (
          <DiffHistoryView sessionName={sessionName} refreshToken={historyRefreshToken} viewMode={viewMode} />
        ) : (
          <>
            {!diff && (
              <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <GitBranch className="h-10 w-10 opacity-20" />
                  <span className="text-sm">{t('noChanges')}</span>
                </div>
              </div>
            )}
            {diff && <DiffFileList diff={diff} viewMode={viewMode} />}
          </>
        )}
      </div>
    </div>
  );
};

export default DiffPanel;
