import { useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import { ListFilter, Monitor, Plus, Terminal, TerminalSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import SessionListItem from '@/components/features/workspace/session-list-item';
import useRemoteTerminalSources from '@/hooks/use-remote-terminal-sources';
import { getWindowsTerminalLinkTarget } from '@/lib/windows-terminal-link';
import type { IRemoteCodexSourceStatus, ISessionMeta, TSessionSourceFilter } from '@/types/timeline';

interface ISessionListViewProps {
  sessions: ISessionMeta[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  sourceFilter: TSessionSourceFilter;
  sourceIdFilter: string | null;
  remoteSources: IRemoteCodexSourceStatus[];
  resumingSessionId: string | null;
  onSelectSession: (session: ISessionMeta) => void;
  onFilterChange: (source: TSessionSourceFilter, sourceId?: string | null) => void;
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  onNewSession?: () => void;
}

const SessionListSkeleton = () => (
  <div className="flex flex-col">
    {[1, 2, 3].map((i) => (
      <div key={i} className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-2 flex items-center justify-between pl-[18px]">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-8 animate-pulse rounded bg-muted" />
        </div>
      </div>
    ))}
  </div>
);

const SessionListError = ({
  error,
  retryLabel,
  onRetry,
}: {
  error: string;
  retryLabel: string;
  onRetry: () => void;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
    <p className="text-sm">{error}</p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      {retryLabel}
    </Button>
  </div>
);

const SessionListView = ({
  sessions,
  total,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  sourceFilter,
  sourceIdFilter,
  remoteSources,
  resumingSessionId,
  onSelectSession,
  onFilterChange,
  onRefresh,
  onLoadMore,
  onNewSession,
}: ISessionListViewProps) => {
  const t = useTranslations('terminal');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { terminals: remoteTerminals } = useRemoteTerminalSources({ enabled: true });

  const handleRefresh = useCallback(async () => {
    await onRefresh();
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [onRefresh]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const isResumeInProgress = !!resumingSessionId;
  const latestRemoteSource = remoteSources[0];
  const windowsTerminalTarget = getWindowsTerminalLinkTarget({
    remoteSources,
    remoteTerminals,
  });
  const sessionCountLabel = total > 0 ? `(${total})` : '';
  const sourceTime = latestRemoteSource?.latestSyncAt
    ? dayjs(latestRemoteSource.latestSyncAt).format('MM/DD HH:mm')
    : null;

  const isFilterActive = (source: TSessionSourceFilter, sourceId?: string | null) =>
    sourceFilter === source && (sourceIdFilter ?? null) === (sourceId ?? null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {t('sessions')}
            {sessionCountLabel}
          </span>
          {onNewSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNewSession}
            >
              <Plus size={12} />
              {t('newConversation')}
            </Button>
          )}
          {windowsTerminalTarget && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.open(
                  windowsTerminalTarget.href,
                  '_blank',
                  'noopener,noreferrer',
                );
              }}
              title={t('openWindowsTerminal')}
            >
              <TerminalSquare size={12} />
              {t('windowsTerminalShort')}
            </Button>
          )}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1 overflow-x-auto">
          <Button
            variant={isFilterActive('all') ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={isFilterActive('all')}
            onClick={() => onFilterChange('all', null)}
          >
            <ListFilter size={12} />
            {t('sessionFilterAll')}
          </Button>
          <Button
            variant={isFilterActive('local') ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={isFilterActive('local')}
            onClick={() => onFilterChange('local', null)}
          >
            <Terminal size={12} />
            {t('sessionFilterLocal')}
          </Button>
          <Button
            variant={isFilterActive('remote') ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={isFilterActive('remote')}
            onClick={() => onFilterChange('remote', null)}
          >
            <Monitor size={12} />
            {t('sessionFilterWindows')}
          </Button>
          {remoteSources.length > 1 && remoteSources.map((source) => (
            <Button
              key={source.sourceId}
              variant={isFilterActive('remote', source.sourceId) ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={isFilterActive('remote', source.sourceId)}
              title={source.sourceLabel}
              onClick={() => onFilterChange('remote', source.sourceId)}
            >
              <Monitor size={12} />
              <span className="max-w-[120px] truncate">{source.sourceId}</span>
              <span className="tabular-nums text-[10px] text-muted-foreground">{source.sessionCount}</span>
            </Button>
          ))}
        </div>
        {latestRemoteSource && sourceTime && (
          <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <Monitor size={11} className="shrink-0" />
            <span className="truncate">
              {t('windowsSourceSummary', {
                label: latestRemoteSource.sourceLabel,
                time: sourceTime,
                count: latestRemoteSource.sessionCount,
              })}
            </span>
          </div>
        )}
      </div>

      {isLoading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : error ? (
        <SessionListError error={error} retryLabel={t('retryLoad')} onRetry={handleRefresh} />
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <TooltipProvider delay={300}>
            {sessions.map((session) => (
              <SessionListItem
                key={`${session.source ?? 'local'}:${session.sessionId}:${session.jsonlPath ?? ''}`}
                session={session}
                isResuming={session.sessionId === resumingSessionId}
                isDisabled={isResumeInProgress}
                onSelect={onSelectSession}
              />
            ))}
          </TooltipProvider>
          {isLoadingMore && (
            <div className="flex items-center justify-center py-3">
              <Spinner size={14} className="text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionListView;
