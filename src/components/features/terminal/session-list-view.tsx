import { useCallback, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import SessionListItem from '@/components/features/terminal/session-list-item';
import type { ISessionMeta } from '@/types/timeline';

interface ISessionListViewProps {
  sessions: ISessionMeta[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  resumingSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
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
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
    <p className="text-sm">{error}</p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      다시 시도
    </Button>
  </div>
);

const SessionListView = ({
  sessions,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  resumingSessionId,
  onSelectSession,
  onRefresh,
  onLoadMore,
  onNewSession,
}: ISessionListViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">
          세션
          {sessions.length > 0 &&
            `(${sessions.length}${hasMore ? '+' : ''})`}
        </span>
        {onNewSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNewSession}
          >
            <Plus size={12} />
            새 대화
          </Button>
        )}
      </div>

      {isLoading && sessions.length === 0 ? (
        <SessionListSkeleton />
      ) : error ? (
        <SessionListError error={error} onRetry={handleRefresh} />
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <TooltipProvider delay={300}>
            {sessions.map((session) => (
              <SessionListItem
                key={session.sessionId}
                session={session}
                isResuming={session.sessionId === resumingSessionId}
                isDisabled={isResumeInProgress}
                onSelect={onSelectSession}
              />
            ))}
          </TooltipProvider>
          {isLoadingMore && (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionListView;
