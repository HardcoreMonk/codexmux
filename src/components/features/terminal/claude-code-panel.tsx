import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useSessionView from '@/hooks/use-session-view';
import SessionListView from '@/components/features/terminal/session-list-view';
import SessionEmptyView from '@/components/features/terminal/session-empty-view';
import SessionNavBar from '@/components/features/terminal/session-nav-bar';
import TimelineView from '@/components/features/timeline/timeline-view';

const AUTO_RESUME_TIMEOUT_MS = 10_000;

interface IClaudeCodePanelProps {
  sessionName: string;
  claudeSessionId?: string | null;
  className?: string;
}

const ClaudeCodePanel = ({ sessionName, claudeSessionId, className }: IClaudeCodePanelProps) => {
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [isAutoResuming, setIsAutoResuming] = useState(!!claudeSessionId);
  const navigateToTimelineRef = useRef<() => void>(() => {});

  const handleResumeStarted = useCallback(
    () => {
      setResumingSessionId(null);
      navigateToTimelineRef.current();
    },
    [],
  );

  const handleResumeBlocked = useCallback(
    (payload: { reason: string; processName?: string }) => {
      setResumingSessionId(null);
      toast.warning('터미널에서 다른 프로세스가 실행 중입니다', {
        description: payload.processName
          ? `현재 실행 중인 프로세스: ${payload.processName}`
          : undefined,
      });
    },
    [],
  );

  const handleResumeError = useCallback(() => {
    setResumingSessionId(null);
    toast.error('세션을 재개할 수 없습니다');
  }, []);

  const {
    entries,
    sessionStatus,
    wsStatus,
    isAutoScrollEnabled,
    setAutoScrollEnabled,
    isLoading: isTimelineLoading,
    isSessionTransitioning,
    error: timelineError,
    loadMore: loadMoreTimeline,
    hasMore: timelineHasMore,
    retrySession,
    sendResume,
  } = useTimeline({
    sessionName,
    enabled: !!sessionName,
    resumeCallbacks: {
      onResumeStarted: handleResumeStarted,
      onResumeBlocked: handleResumeBlocked,
      onResumeError: handleResumeError,
    },
  });

  const {
    sessions,
    hasMore: sessionListHasMore,
    isLoading: isSessionListLoading,
    isLoadingMore: isSessionListLoadingMore,
    error: sessionListError,
    refetch: refetchSessions,
    loadMore: loadMoreSessions,
  } = useSessionList({
    tmuxSession: sessionName,
    enabled: !!sessionName && sessionStatus !== 'active' && !isAutoResuming,
  });

  const { view, navigateToList, navigateToTimeline } = useSessionView(
    sessionStatus,
    sessions,
    isSessionListLoading,
  );

  useEffect(() => {
    navigateToTimelineRef.current = navigateToTimeline;
  });

  useEffect(() => {
    if (!isAutoResuming) return;

    const delay = sessionStatus === 'active' ? 0 : AUTO_RESUME_TIMEOUT_MS;
    const timer = setTimeout(() => {
      setIsAutoResuming(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [isAutoResuming, sessionStatus]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (resumingSessionId) return;
      setResumingSessionId(sessionId);
      sendResume(sessionId, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  const handleNavigateToList = useCallback(() => {
    if (resumingSessionId) return;
    refetchSessions();
    navigateToList();
  }, [resumingSessionId, refetchSessions, navigateToList]);

  if (isAutoResuming) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">이전 세션을 복원하는 중...</span>
        </div>
      </div>
    );
  }

  if (view === 'empty') {
    return (
      <div className={cn('h-full w-full', className)}>
        <SessionEmptyView />
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className={cn('h-full w-full', className)}>
        <SessionListView
          sessions={sessions}
          isLoading={isSessionListLoading}
          isLoadingMore={isSessionListLoadingMore}
          hasMore={sessionListHasMore}
          error={sessionListError}
          highlightedSessionId={claudeSessionId ?? null}
          resumingSessionId={resumingSessionId}
          onSelectSession={handleSelectSession}
          onRefresh={refetchSessions}
          onLoadMore={loadMoreSessions}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <SessionNavBar onNavigateToList={handleNavigateToList} />
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          sessionStatus={sessionStatus}
          wsStatus={wsStatus}
          isLoading={isTimelineLoading}
          isSessionTransitioning={isSessionTransitioning}
          error={timelineError}
          isAutoScrollEnabled={isAutoScrollEnabled}
          onAutoScrollChange={setAutoScrollEnabled}
          onRetry={retrySession}
          onLoadMore={loadMoreTimeline}
          hasMore={timelineHasMore}
        />
      </div>
    </div>
  );
};

export default ClaudeCodePanel;
