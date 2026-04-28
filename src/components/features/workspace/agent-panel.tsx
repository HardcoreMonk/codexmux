import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useStartingPrompt from '@/hooks/use-starting-prompt';
import useTabStore, { selectAgentInstalled, selectAgentProcess, selectSessionView } from '@/hooks/use-tab-store';
import { useSessionMetaCompute } from '@/hooks/use-session-meta';
import SessionListView from '@/components/features/workspace/session-list-view';
import SessionEmptyView from '@/components/features/workspace/session-empty-view';
import BypassPromptCard from '@/components/features/workspace/bypass-prompt-card';
import TimelineView from '@/components/features/timeline/timeline-view';
import SessionMetaBar, { SessionMetaBarSkeleton } from '@/components/features/workspace/session-meta-bar';
import { isAgentPanelType } from '@/lib/panel-type';
import type { TPanelType } from '@/types/terminal';

interface IAgentPanelProps {
  tabId: string;
  sessionName: string;
  agentSessionId?: string | null;
  panelType?: TPanelType;
  cwd?: string;
  className?: string;
  onClose?: () => void;
  onNewSession?: () => void;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
  addPendingMessageRef?: React.MutableRefObject<((text: string, options?: { autoHide?: boolean; attachmentPlaceholder?: boolean }) => string) | undefined>;
  removePendingMessageRef?: React.MutableRefObject<((id: string) => void) | undefined>;
}

const AgentPanel = ({
  tabId,
  sessionName,
  agentSessionId,
  panelType = 'codex',
  cwd,
  className,
  onClose,
  onNewSession,
  scrollToBottomRef,
  addPendingMessageRef,
  removePendingMessageRef,
}: IAgentPanelProps) => {
  const t = useTranslations('terminal');
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);

  const agentProcess = useTabStore((s) => selectAgentProcess(s.tabs, tabId));
  const agentInstalled = useTabStore((s) => selectAgentInstalled(s.tabs, tabId));
  const storeCliState = useTabStore((s) => s.tabs[tabId]?.cliState ?? 'inactive');
  const compactingSince = useTabStore((s) => s.tabs[tabId]?.compactingSince ?? null);
  const view = useTabStore((s) => selectSessionView(s.tabs, tabId));
  const cachedSessionMeta = useTabStore((s) => s.tabs[tabId]?.sessionMetaCache ?? null);
  const tabAgentSummary = useTabStore((s) => s.tabs[tabId]?.agentSummary ?? null);
  const tabLastUserMessage = useTabStore((s) => s.tabs[tabId]?.lastUserMessage ?? null);
  const isAgentPanel = isAgentPanelType(panelType);

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
    jsonlPath,
    sessionSummary,
    initMeta,
    sessionStats,
    agentProcess: agentProcessFromTimeline,
    wsStatus,
    isLoading: isTimelineLoading,
    error: timelineError,
    loadMore: loadMoreTimeline,
    hasMore: timelineHasMore,
    retrySession,
    sendResume,
    addPendingUserMessage,
    removePendingUserMessage,
  } = useTimeline({
    sessionName,
    agentSessionId,
    panelType,
    enabled: !!sessionName,
    resumeCallbacks: {
      onResumeStarted: handleResumeStarted,
      onResumeBlocked: handleResumeBlocked,
      onResumeError: handleResumeError,
    },
    onSync: (state) => {
      const checkedAt = Date.now();
      if (state.agentProcess !== null) {
        useTabStore.getState().setAgentProcess(tabId, state.agentProcess, checkedAt);
      }
      if (!state.agentInstalled) {
        useTabStore.getState().setAgentInstalled(tabId, false);
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
    enabled: isAgentPanel && !!sessionName && agentProcess !== true,
    cwd,
    panelType,
  });

  useEffect(() => {
    if (addPendingMessageRef) addPendingMessageRef.current = addPendingUserMessage;
    if (removePendingMessageRef) removePendingMessageRef.current = removePendingUserMessage;
    return () => {
      if (addPendingMessageRef) addPendingMessageRef.current = undefined;
      if (removePendingMessageRef) removePendingMessageRef.current = undefined;
    };
  }, [addPendingMessageRef, removePendingMessageRef, addPendingUserMessage, removePendingUserMessage]);

  const prevAgentProcessRef = useRef(agentProcess);
  useEffect(() => {
    const prev = prevAgentProcessRef.current;
    prevAgentProcessRef.current = agentProcess;
    if (prev !== true && agentProcess === true && agentProcessFromTimeline !== true) {
      retrySession();
    }
  }, [agentProcess, agentProcessFromTimeline, retrySession]);

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

  const isHeaderLoading = agentProcess === null || (entries.length === 0 && isTimelineLoading);
  const freshMeta = useSessionMetaCompute(entries, sessionSummary, initMeta, sessionStats, tabAgentSummary, tabLastUserMessage);

  useEffect(() => {
    if (!isHeaderLoading) {
      useTabStore.getState().setSessionMetaCache(tabId, { meta: freshMeta, sessionId, jsonlPath });
    }
  }, [isHeaderLoading, freshMeta, sessionId, jsonlPath, tabId]);

  const handleSelectSession = useCallback(
    (sid: string) => {
      if (resumingSessionId) return;
      setResumingSessionId(sid);
      sendResume(sid, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (!agentInstalled) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground', className)}>
        <span className="text-sm font-medium">{t('installCodex')}</span>
        <span className="text-xs">{t('installCodexHint')}</span>
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center animate-delayed-fade-in', className)}>
        <Spinner className="h-4 w-4 text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">{(agentSessionId || sessionId) ? t('resumingSession') : t('creatingConversation')}</span>
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
    if (!isAgentPanel) {
      return (
        <div className={cn('h-full w-full', className)}>
          <SessionEmptyView onClose={onClose} onNewSession={onNewSession} />
        </div>
      );
    }
    if (agentProcess === null || (isSessionListLoading && sessions.length === 0)) {
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

  const displayMeta = isHeaderLoading
    ? cachedSessionMeta
    : { meta: freshMeta, sessionId, jsonlPath };

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      {displayMeta ? (
        <SessionMetaBar
          meta={displayMeta.meta}
          sessionName={sessionName}
          sessionId={displayMeta.sessionId}
          jsonlPath={displayMeta.jsonlPath}
        />
      ) : (
        <SessionMetaBarSkeleton />
      )}
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          tasks={tasks}
          sessionId={sessionId}
          sessionName={sessionName}
          tabId={tabId}
          initMeta={initMeta}
          sessionStats={sessionStats}
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

export default AgentPanel;
