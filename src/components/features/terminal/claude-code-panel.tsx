import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useTimelineStoreSync from '@/hooks/use-timeline-store-sync';
import useTabStore, { selectSessionView, selectEffectiveSessionStatus } from '@/hooks/use-tab-store';
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

  const claudeProcess = useTabStore((s) => s.tabs[tabId]?.claudeProcess ?? 'unknown');
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
    sessionStatus,
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
  });

  const effectiveSessionStatus = useTabStore((s) => selectEffectiveSessionStatus(s.tabs, tabId));

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

  useTimelineStoreSync({
    tabId,
    sessionStatus,
    cliState,
    isTimelineLoading,
    wsStatus,
    sessionsCount: sessions.length,
    claudeProcess,
    retrySession,
  });

  // 재시작 완료 감지
  const restartNeedsExitRef = useRef(false);
  const prevIsRestartingRef = useRef(false);

  useEffect(() => {
    if (isRestarting && !prevIsRestartingRef.current) {
      restartNeedsExitRef.current = effectiveSessionStatus === 'active';
    }
    prevIsRestartingRef.current = isRestarting;

    if (!isRestarting) return;

    if (restartNeedsExitRef.current && effectiveSessionStatus !== 'active') {
      restartNeedsExitRef.current = false;
    }

    if (cliState === 'idle' && !restartNeedsExitRef.current) {
      useTabStore.getState().setRestarting(tabId, false);
    }
  }, [isRestarting, effectiveSessionStatus, cliState, tabId]);

  // effectiveCliState for TimelineView
  const effectiveCliState = effectiveSessionStatus === 'none' && cliState !== 'inactive'
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
          sessionStatus={sessionStatus}
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
