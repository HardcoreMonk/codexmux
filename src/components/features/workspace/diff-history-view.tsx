import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, GitBranch, GitMerge } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { ICommitLogEntry } from '@/lib/git-log';
import { compactFromNow, absoluteTime } from '@/lib/compact-time';
import DiffFileList from '@/components/features/workspace/diff-file-list';

type TViewMode = 'split' | 'unified';

interface IDiffHistoryViewProps {
  sessionName: string;
  refreshToken: number;
  viewMode: TViewMode;
}

interface IGitLogResponse {
  isGitRepo: boolean;
  head?: string;
  branch?: string;
  upstreamHash?: string | null;
  commits?: ICommitLogEntry[];
}

interface ICommitDetail {
  commit: {
    hash: string;
    shortHash: string;
    subject: string;
    body: string;
    author: string;
    email: string;
    timestamp: number;
    parents: string[];
  };
  diff: string;
}

const DiffHistoryView = ({ sessionName, refreshToken, viewMode }: IDiffHistoryViewProps) => {
  const t = useTranslations('diff');

  const [data, setData] = useState<IGitLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [detail, setDetail] = useState<ICommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchLog = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/layout/git-log?session=${sessionName}`, { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        setData(null);
        return;
      }
      const json: IGitLogResponse = await res.json();
      if (!signal.aborted) setData(json);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setData(null);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLog(controller.signal);
    return () => controller.abort();
  }, [fetchLog, refreshToken]);

  useEffect(() => {
    if (!selectedHash) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    fetch(`/api/layout/commit-diff?session=${sessionName}&hash=${selectedHash}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ICommitDetail | null) => {
        if (!controller.signal.aborted) setDetail(json);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setDetail(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [sessionName, selectedHash, refreshToken]);

  const aheadHashes = useMemo(() => {
    if (!data?.commits || !data.upstreamHash) return new Set<string>();
    const set = new Set<string>();
    for (const c of data.commits) {
      if (c.hash === data.upstreamHash) break;
      set.add(c.hash);
    }
    return set;
  }, [data]);

  if (selectedHash) {
    return (
      <div className="flex h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
          <button
            type="button"
            onClick={() => setSelectedHash(null)}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t('back')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('back')}
          </button>

          {detail && (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
              <span className="shrink-0 font-mono text-muted-foreground">{detail.commit.shortHash}</span>
              <span className="shrink-0 text-muted-foreground">·</span>
              <span className="truncate text-foreground" title={detail.commit.subject}>
                {detail.commit.subject}
              </span>
              <span className="shrink-0 text-muted-foreground">·</span>
              <span className="shrink-0 text-muted-foreground" title={detail.commit.email}>
                {detail.commit.author}
              </span>
              <span className="shrink-0 text-muted-foreground">·</span>
              <span
                className="shrink-0 tabular-nums text-muted-foreground"
                title={absoluteTime(detail.commit.timestamp)}
              >
                {compactFromNow(detail.commit.timestamp)}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {detailLoading && !detail ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-5 w-5 text-muted-foreground" />
            </div>
          ) : detail ? (
            detail.diff ? (
              <DiffFileList diff={detail.diff} viewMode={viewMode} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('noChanges')}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('commitNotFound')}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  const commits = data?.commits ?? [];

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <GitBranch className="h-10 w-10 opacity-20" />
          <span className="text-sm">{t('noCommits')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-2 py-1 font-mono text-xs">
      {commits.map((c, i) => {
        const isHead = i === 0;
        const isAhead = aheadHashes.has(c.hash);
        return (
          <button
            type="button"
            key={c.hash}
            onClick={() => setSelectedHash(c.hash)}
            className="group relative flex items-start gap-2 rounded px-2 py-1 text-left hover:bg-accent/40"
          >
            <div className="relative flex w-4 shrink-0 flex-col items-center">
              {c.isMerge ? (
                <GitMerge
                  className={cn(
                    'mt-[3px] h-3 w-3',
                    isAhead ? 'text-ui-blue' : 'text-muted-foreground',
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'mt-[6px] h-1.5 w-1.5 rounded-full',
                    isAhead ? 'bg-ui-blue' : 'bg-muted-foreground/70',
                  )}
                />
              )}
              {i < commits.length - 1 && (
                <span className="mt-[2px] flex-1 border-l border-border/60" />
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 text-muted-foreground/70">{c.shortHash}</span>
              <span className="min-w-0 flex-1 truncate text-foreground" title={c.subject}>
                {c.subject}
              </span>
              {isHead && (
                <span className="shrink-0 rounded bg-accent px-1 text-[10px] text-foreground">
                  HEAD
                </span>
              )}
              {isAhead && !isHead && (
                <span className="shrink-0 rounded bg-ui-blue/15 px-1 text-[10px] text-ui-blue">
                  {t('ahead')}
                </span>
              )}
              <span
                className="w-8 shrink-0 text-right tabular-nums text-muted-foreground/60"
                title={absoluteTime(c.timestamp)}
              >
                {compactFromNow(c.timestamp)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default DiffHistoryView;
