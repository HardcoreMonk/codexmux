import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useTabStore, { selectSessionView, isCliIdle } from '@/hooks/use-tab-store';
import SessionListView from '@/components/features/terminal/session-list-view';
import SessionEmptyView from '@/components/features/terminal/session-empty-view';
import TimelineView from '@/components/features/timeline/timeline-view';
import SessionMetaBar from '@/components/features/terminal/session-meta-bar';

interface IClaudeCodePanelProps {
  tabId: string;
  sessionName: string;
  claudeSessionId?: string | null;
  cwd?: string;
  className?: string;
  onClose?: () => void;
  onNewSession?: () => void;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
}

const ClaudeCodePanel = ({
  tabId,
  sessionName,
  claudeSessionId,
  cwd,
  className,
  onClose,
  onNewSession,
  scrollToBottomRef,
}: IClaudeCodePanelProps) => {
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);

  const claudeStatus = useTabStore((s) => s.tabs[tabId]?.claudeStatus ?? 'unknown');
  const isRestarting = useTabStore((s) => s.tabs[tabId]?.isRestarting ?? false);
  const view = useTabStore((s) => selectSessionView(s.tabs, tabId));

  const handleResumeStarted = useCallback(
    () => {
      setResumingSessionId(null);
      useTabStore.getState().navigateToTimeline(tabId);
    },
    [tabId],
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
    tasks,
    cliState,
    sessionId,
    sessionSummary,
    initMeta,
    claudeStatus: claudeStatusFromTimeline,
    wsStatus,
    isLoading: isTimelineLoading,
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
    onSync: (state) => {
      useTabStore.getState().setClaudeStatus(tabId, state.claudeStatus, Date.now());
      useTabStore.getState().setCliState(tabId, state.cliState);
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
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
    enabled: !!sessionName && claudeStatus !== 'running',
    cwd,
  });

  const prevClaudeStatusRef = useRef(claudeStatus);
  useEffect(() => {
    const prev = prevClaudeStatusRef.current;
    prevClaudeStatusRef.current = claudeStatus;
    if (prev !== 'running' && claudeStatus === 'running' && claudeStatusFromTimeline !== 'running') {
      retrySession();
    }
  }, [claudeStatus, claudeStatusFromTimeline, retrySession]);

  const restartNeedsExitRef = useRef(false);
  const prevIsRestartingRef = useRef(false);

  useEffect(() => {
    if (isRestarting && !prevIsRestartingRef.current) {
      restartNeedsExitRef.current = claudeStatus === 'running';
    }
    prevIsRestartingRef.current = isRestarting;

    if (!isRestarting) return;

    if (restartNeedsExitRef.current && claudeStatus !== 'running') {
      restartNeedsExitRef.current = false;
    }

    if (isCliIdle(cliState) && !restartNeedsExitRef.current) {
      useTabStore.getState().setRestarting(tabId, false);
    }
  }, [isRestarting, claudeStatus, cliState, tabId]);

  const effectiveCliState = claudeStatus !== 'running' && cliState !== 'inactive'
    ? 'inactive' as const
    : cliState;

  const handleSelectSession = useCallback(
    (sid: string) => {
      if (resumingSessionId) return;
      setResumingSessionId(sid);
      sendResume(sid, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (view === 'restarting') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">새 대화 만드는중...</span>
      </div>
    );
  }

  if (view === 'inactive' && sessions.length === 0) {
    return (
      <div className={cn('h-full w-full', className)}>
        <SessionEmptyView onClose={onClose} onNewSession={onNewSession} />
      </div>
    );
  }

  if (view === 'inactive') {
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
          onNewSession={onNewSession}
        />
      </div>
    );
  }

  if (view === 'loading') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      <SessionMetaBar entries={entries} sessionName={sessionName} sessionId={sessionId} sessionSummary={sessionSummary} initMeta={initMeta} />
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          tasks={tasks}
          sessionId={sessionId}
          cliState={effectiveCliState}
          claudeStatus={claudeStatusFromTimeline}
          wsStatus={wsStatus}
          isLoading={isTimelineLoading}
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
