import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
  isClaudeRunning?: boolean;
  cwd?: string;
  className?: string;
  onCliStateChange?: (state: TCliState) => void;
  onInputVisibleChange?: (visible: boolean) => void;
  onClose?: () => void;
  onNewSession?: () => void;
  isRestarting?: boolean;
  onRestartComplete?: () => void;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
}

const ClaudeCodePanel = ({
  sessionName,
  claudeSessionId,
  isClaudeRunning,
  cwd,
  className,
  onCliStateChange,
  onInputVisibleChange,
  onClose,
  onNewSession,
  isRestarting,
  onRestartComplete,
  scrollToBottomRef,
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
    isLoading: isTimelineLoading,
    isSessionTransitioning,
    error: timelineError,
    loadMore: loadMoreTimeline,
    hasMore: timelineHasMore,
    retrySession,
    sendResume,
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

  const effectiveSessionStatus = sessionStatus === 'active' && isClaudeRunning === false
    ? 'none' as const
    : sessionStatus;

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
    enabled: !!sessionName && effectiveSessionStatus !== 'active',
    cwd,
  });

  const { view, navigateToTimeline } = useSessionView(
    effectiveSessionStatus,
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
    if (isRestarting && effectiveSessionStatus === 'active') {
      onRestartComplete?.();
    }
  }, [isRestarting, effectiveSessionStatus, onRestartComplete]);

  const isInputVisible = view === 'timeline';

  const effectiveCliState = effectiveSessionStatus === 'none' && cliState !== 'inactive'
    ? 'inactive' as const
    : cliState;

  useEffect(() => {
    onCliStateChange?.(effectiveCliState);
  }, [effectiveCliState, onCliStateChange]);

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

  if (isRestarting && view !== 'timeline') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">새 대화 만드는중...</span>
      </div>
    );
  }

  if (view === 'empty') {
    return (
      <div className={cn('h-full w-full', className)}>
        <SessionEmptyView onClose={onClose} onNewSession={onNewSession} />
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
          resumingSessionId={resumingSessionId}
          onSelectSession={handleSelectSession}
          onRefresh={refetchSessions}
          onLoadMore={loadMoreSessions}
          onClose={onClose}
          onNewSession={onNewSession}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      <SessionMetaBar entries={entries} sessionName={sessionName} sessionId={sessionId} sessionSummary={sessionSummary} />
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          sessionId={sessionId}
          cliState={effectiveCliState}
          sessionStatus={sessionStatus}
          wsStatus={wsStatus}
          isLoading={isTimelineLoading}
          isSessionTransitioning={isSessionTransitioning}
          error={timelineError}
          onRetry={retrySession}
          onLoadMore={loadMoreTimeline}
          hasMore={timelineHasMore}
          scrollToBottomRef={scrollToBottomRef}
        />
      </div>
    </div>
  );
};

export default ClaudeCodePanel;
