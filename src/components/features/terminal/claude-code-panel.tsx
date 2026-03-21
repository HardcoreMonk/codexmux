import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useSessionView from '@/hooks/use-session-view';
import SessionListView from '@/components/features/terminal/session-list-view';
import SessionEmptyView from '@/components/features/terminal/session-empty-view';
import TimelineView from '@/components/features/timeline/timeline-view';
import SessionMetaBar from '@/components/features/terminal/session-meta-bar';
import type { TCliState } from '@/types/timeline';

interface IClaudeCodePanelProps {
  sessionName: string;
  claudeSessionId?: string | null;
  className?: string;
  onCliStateChange?: (state: TCliState) => void;
  onInputVisibleChange?: (visible: boolean) => void;
  onClose?: () => void;
  processHintRef?: React.MutableRefObject<((isClaudeRunning: boolean) => void) | undefined>;
}

const ClaudeCodePanel = ({
  sessionName,
  claudeSessionId,
  className,
  onCliStateChange,
  onInputVisibleChange,
  onClose,
  processHintRef,
}: IClaudeCodePanelProps) => {
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
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
    cliState,
    sessionId,
    sessionSummary,
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
    sendProcessHint,
  } = useTimeline({
    sessionName,
    claudeSessionId,
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
    enabled: !!sessionName && sessionStatus !== 'active',
  });

  const { view, navigateToTimeline } = useSessionView(
    sessionStatus,
    sessions,
    isSessionListLoading,
    sessionListError,
    claudeSessionId,
    isTimelineLoading,
  );

  useEffect(() => {
    navigateToTimelineRef.current = navigateToTimeline;
  });

  useEffect(() => {
    if (processHintRef) {
      processHintRef.current = sendProcessHint;
      return () => { processHintRef.current = undefined; };
    }
  }, [processHintRef, sendProcessHint]);

  const isInputVisible = view === 'timeline';

  useEffect(() => {
    onCliStateChange?.(cliState);
  }, [cliState, onCliStateChange]);

  useEffect(() => {
    onInputVisibleChange?.(isInputVisible);
  }, [isInputVisible, onInputVisibleChange]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (resumingSessionId) return;
      setResumingSessionId(sessionId);
      sendResume(sessionId, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (view === 'empty') {
    return (
      <div className={cn('h-full w-full', className)}>
        <SessionEmptyView onClose={onClose} />
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
          onClose={onClose}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      <SessionMetaBar entries={entries} sessionName={sessionName} sessionSummary={sessionSummary} />
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          sessionId={sessionId}
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
