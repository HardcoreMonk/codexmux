import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useStartingPrompt from '@/hooks/use-starting-prompt';
import useTabStore, { selectSessionView } from '@/hooks/use-tab-store';
import SessionListView from '@/components/features/terminal/session-list-view';
import SessionEmptyView from '@/components/features/terminal/session-empty-view';
import BypassPromptCard from '@/components/features/terminal/bypass-prompt-card';
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
  addPendingMessageRef?: React.MutableRefObject<((text: string) => void) | undefined>;
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
  addPendingMessageRef,
}: IClaudeCodePanelProps) => {
  const t = useTranslations('terminal');
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);

  const claudeProcess = useTabStore((s) => s.tabs[tabId]?.claudeProcess ?? null);
  const claudeInstalled = useTabStore((s) => s.tabs[tabId]?.claudeInstalled ?? true);
  const storeCliState = useTabStore((s) => s.tabs[tabId]?.cliState ?? 'inactive');
  const compactingSince = useTabStore((s) => s.tabs[tabId]?.compactingSince ?? null);
  const view = useTabStore((s) => selectSessionView(s.tabs, tabId));

  const handleResumeStarted = useCallback(
    () => {
      setResumingSessionId(null);
    },
    [],
  );

  const handleResumeBlocked = useCallback(
    (payload: { reason: string; processName?: string }) => {
      setResumingSessionId(null);
      toast.warning(t('resumeBlocked'), {
        description: payload.processName
          ? t('resumeBlockedProcess', { name: payload.processName })
          : undefined,
      });
    },
    [t],
  );

  const handleResumeError = useCallback(() => {
    setResumingSessionId(null);
    toast.error(t('resumeFailed'));
  }, [t]);

  const {
    entries,
    tasks,
    sessionId,
    sessionSummary,
    initMeta,
    claudeProcess: claudeProcessFromTimeline,
    wsStatus,
    isLoading: isTimelineLoading,
    error: timelineError,
    loadMore: loadMoreTimeline,
    hasMore: timelineHasMore,
    retrySession,
    sendResume,
    addPendingUserMessage,
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
      const checkedAt = Date.now();
      if (state.claudeProcess !== null) {
        useTabStore.getState().setClaudeProcess(tabId, state.claudeProcess, checkedAt);
      }
      if (!state.claudeInstalled) {
        useTabStore.getState().setClaudeInstalled(tabId, false);
      }
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
    },
    getCliState: () => useTabStore.getState().tabs[tabId]?.cliState,
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
    enabled: !!sessionName && claudeProcess !== true,
    cwd,
  });

  useEffect(() => {
    if (!addPendingMessageRef) return;
    addPendingMessageRef.current = addPendingUserMessage;
    return () => {
      addPendingMessageRef.current = undefined;
    };
  }, [addPendingMessageRef, addPendingUserMessage]);

  const prevClaudeProcessRef = useRef(claudeProcess);
  useEffect(() => {
    const prev = prevClaudeProcessRef.current;
    prevClaudeProcessRef.current = claudeProcess;
    if (prev !== true && claudeProcess === true && claudeProcessFromTimeline !== true) {
      retrySession();
    }
  }, [claudeProcess, claudeProcessFromTimeline, retrySession]);

  useEffect(() => {
    if (storeCliState !== 'unknown') return;
    const controller = new AbortController();
    fetch('/api/tmux/recover-unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [tabId, storeCliState]);

  const startingPromptOptions = useStartingPrompt(view === 'check', sessionName);

  const handleSelectSession = useCallback(
    (sid: string) => {
      if (resumingSessionId) return;
      setResumingSessionId(sid);
      sendResume(sid, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (!claudeInstalled) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground', className)}>
        <span className="text-sm font-medium">{t('installClaude')}</span>
        <span className="text-xs">{t('installClaudeHint')}</span>
      </div>
    );
  }

  if (claudeProcess === null && view !== 'check') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center animate-delayed-fade-in', className)}>
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center animate-delayed-fade-in', className)}>
        <Spinner className="h-4 w-4 text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">{(claudeSessionId || sessionId) ? t('resumingSession') : t('creatingConversation')}</span>
        {startingPromptOptions && (
          startingPromptOptions.isBypassPrompt && startingPromptOptions.options.length > 0 ? (
            <BypassPromptCard
              sessionName={sessionName}
              options={startingPromptOptions.options}
              fallback={
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={onClose}
                >
                  {t('checkTerminal')}
                </button>
              }
            />
          ) : (
            <button
              className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={onClose}
            >
              {t('checkTerminal')}
            </button>
          )
        )}
      </div>
    );
  }

  if (view === 'session-list') {
    if (isSessionListLoading && sessions.length === 0) {
      return (
        <div className={cn('flex h-full w-full flex-col items-center justify-center animate-delayed-fade-in', className)}>
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }
    if (sessions.length === 0 && !sessionListError) {
      return (
        <div className={cn('h-full w-full', className)}>
          <SessionEmptyView onClose={onClose} onNewSession={onNewSession} />
        </div>
      );
    }
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

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      <SessionMetaBar entries={entries} sessionName={sessionName} sessionId={sessionId} sessionSummary={sessionSummary} initMeta={initMeta} />
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          tasks={tasks}
          sessionId={sessionId}
          sessionName={sessionName}
          tabId={tabId}
          initMeta={initMeta}
          cliState={storeCliState}
          compactingSince={compactingSince}
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
