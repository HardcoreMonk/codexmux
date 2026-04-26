import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import useTimeline from '@/hooks/use-timeline';
import useStartingPrompt from '@/hooks/use-starting-prompt';
import useSessionList from '@/hooks/use-session-list';
import useTabStore, { selectSessionView } from '@/hooks/use-tab-store';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import useGitStatus from '@/hooks/use-git-status';
import useTmuxInfo from '@/hooks/use-tmux-info';
import useMessageCounts from '@/hooks/use-message-counts';
import SessionListView from '@/components/features/workspace/session-list-view';
import SessionEmptyView from '@/components/features/workspace/session-empty-view';
import BypassPromptCard from '@/components/features/workspace/bypass-prompt-card';
import TimelineView from '@/components/features/timeline/timeline-view';
import WebInputBar from '@/components/features/workspace/web-input-bar';
import QuickPromptBar from '@/components/features/workspace/quick-prompt-bar';
import { MetaCompact } from '@/components/features/workspace/session-meta-content';
import MobileMetaSheet from './mobile-meta-sheet';
import useQuickPrompts from '@/hooks/use-quick-prompts';
import type { TCliState } from '@/types/timeline';

interface IMobileClaudeCodePanelProps {
  tabId?: string;
  wsId?: string;
  sessionName: string;
  claudeSessionId?: string | null;
  cwd?: string;
  sendStdin: (data: string) => void;
  terminalWsConnected: boolean;
  focusTerminal: () => void;
  focusInputRef: React.MutableRefObject<(() => void) | undefined>;
  setInputValueRef: React.MutableRefObject<((v: string) => void) | undefined>;
  onCliStateChange: (state: TCliState) => void;
  onInputVisibleChange: (visible: boolean) => void;
  onRestartSession?: () => void;
  onNewSession?: () => void;
}

const MobileClaudeCodePanel = ({
  tabId,
  wsId,
  sessionName,
  claudeSessionId,
  cwd,
  sendStdin,
  terminalWsConnected,
  focusTerminal,
  focusInputRef,
  setInputValueRef,
  onCliStateChange,
  onInputVisibleChange,
  onRestartSession,
  onNewSession,
}: IMobileClaudeCodePanelProps) => {
  const t = useTranslations('terminal');
  const { prompts: quickPrompts } = useQuickPrompts();
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [metaSheetOpen, setMetaSheetOpen] = useState(false);
  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);

  const claudeProcess = useTabStore((s) => tabId ? s.tabs[tabId]?.claudeProcess ?? null : null);
  const claudeInstalled = useTabStore((s) => tabId ? s.tabs[tabId]?.claudeInstalled ?? true : true);
  const storeCliState = useTabStore((s) => tabId ? s.tabs[tabId]?.cliState ?? 'inactive' : 'inactive');
  const compactingSince = useTabStore((s) => tabId ? s.tabs[tabId]?.compactingSince ?? null : null);
  const tabClaudeSummary = useTabStore((s) => tabId ? s.tabs[tabId]?.claudeSummary ?? null : null);
  const tabLastUserMessage = useTabStore((s) => tabId ? s.tabs[tabId]?.lastUserMessage ?? null : null);

  const handleResumeStarted = useCallback(() => {
    setResumingSessionId(null);
  }, []);

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
    claudeProcess: claudeProcessFromTimeline,
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
    claudeSessionId,
    enabled: !!sessionName,
    resumeCallbacks: {
      onResumeStarted: handleResumeStarted,
      onResumeBlocked: handleResumeBlocked,
      onResumeError: handleResumeError,
    },
    onSync: tabId ? (state) => {
      const checkedAt = Date.now();
      if (state.claudeProcess !== null) {
        useTabStore.getState().setClaudeProcess(tabId, state.claudeProcess, checkedAt);
      }
      if (!state.claudeInstalled) {
        useTabStore.getState().setClaudeInstalled(tabId, false);
      }
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
    } : undefined,
    getCliState: tabId ? () => useTabStore.getState().tabs[tabId]?.cliState : undefined,
  });

  const effectiveClaudeProcess = tabId ? claudeProcess : claudeProcessFromTimeline;

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
    enabled: !!sessionName && effectiveClaudeProcess !== true,
    cwd,
  });

  const prevClaudeProcessRef = useRef(claudeProcess);
  useEffect(() => {
    const prev = prevClaudeProcessRef.current;
    prevClaudeProcessRef.current = claudeProcess;
    if (prev !== true && claudeProcess === true && claudeProcessFromTimeline !== true) {
      retrySession();
    }
  }, [claudeProcess, claudeProcessFromTimeline, retrySession]);

  const view = useTabStore((s) => tabId ? selectSessionView(s.tabs, tabId) : 'session-list' as const);

  const { meta } = useSessionMeta(entries, sessionSummary, initMeta, sessionStats, tabClaudeSummary, tabLastUserMessage);
  const { branch, isLoading: isBranchLoading } = useGitBranch(sessionName);
  const { status: gitStatus } = useGitStatus(sessionName, metaSheetOpen);
  const tmuxInfo = useTmuxInfo(sessionName, metaSheetOpen);
  const messageCounts = useMessageCounts(jsonlPath, metaSheetOpen);
  const metaWithCounts = messageCounts
    ? { ...meta, userCount: messageCounts.userCount, assistantCount: messageCounts.assistantCount }
    : meta;

  const isInputVisible = view === 'timeline';

  const startingPromptOptions = useStartingPrompt(view === 'check', sessionName);

  useEffect(() => {
    onCliStateChange(storeCliState);
  }, [storeCliState, onCliStateChange]);

  useEffect(() => {
    onInputVisibleChange(isInputVisible);
  }, [isInputVisible, onInputVisibleChange]);

  const handleScrollToBottom = useCallback(() => {
    if (storeCliState !== 'idle') return;
    scrollToBottomRef.current?.();
  }, [storeCliState]);

  const handleSelectQuickPrompt = useCallback((prompt: string) => {
    setInputValueRef.current?.(prompt);
    focusInputRef.current?.();
  }, [setInputValueRef, focusInputRef]);

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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
        <span className="text-sm font-medium">{t('installClaude')}</span>
        <span className="text-xs">{t('installClaudeHint')}</span>
      </div>
    );
  }

  if (claudeProcess === null && view !== 'check') {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted">
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted">
        <Spinner className="h-4 w-4 text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">{(claudeSessionId || sessionId) ? t('resumingSession') : t('creatingConversation')}</span>
        {startingPromptOptions && (
          startingPromptOptions.isBypassPrompt && startingPromptOptions.options.length > 0 ? (
            <BypassPromptCard
              sessionName={sessionName}
              options={startingPromptOptions.options}
              fallback={
                <span className="text-xs text-muted-foreground">{t('checkTerminal')}</span>
              }
            />
          ) : (
            <span className="mt-3 text-xs text-muted-foreground">{t('checkTerminal')}</span>
          )
        )}
      </div>
    );
  }

  if (view === 'session-list') {
    if (isSessionListLoading && sessions.length === 0) {
      return (
        <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted">
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }
    if (sessions.length === 0 && !sessionListError) {
      return (
        <div className="flex min-h-0 flex-1 flex-col bg-muted">
          <SessionEmptyView onNewSession={onNewSession} />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-muted">
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
    <div className="flex min-h-0 flex-1 flex-col bg-muted">
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between border-b px-4 py-1.5 hover:bg-muted/30"
        role="button"
        tabIndex={0}
        onClick={() => setMetaSheetOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMetaSheetOpen(true);
          }
        }}
      >
        <MetaCompact
          title={meta.title}
          totalCost={meta.totalCost}
          branch={branch}
          usedPercentage={meta.usedPercentage}
          currentContextTokens={meta.currentContextTokens}
          contextWindowSize={meta.contextWindowSize}
        />
        <ChevronDown
          size={14}
          className="shrink-0 text-muted-foreground"
        />
      </div>

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

      <div className="shrink-0 pb-3">
        <WebInputBar
          tabId={tabId}
          wsId={wsId}
          sessionName={sessionName}
          claudeSessionId={claudeSessionId}
          cliState={storeCliState}
          sendStdin={sendStdin}
          terminalWsConnected={terminalWsConnected}
          visible={isInputVisible}
          focusTerminal={focusTerminal}
          focusInputRef={focusInputRef}
          setInputValueRef={setInputValueRef}
          maxRows={3}
          onRestartSession={onRestartSession}
          onSend={handleScrollToBottom}
          onOptimisticSend={addPendingUserMessage}
          onAddPendingMessage={addPendingUserMessage}
          onRemovePendingMessage={removePendingUserMessage}
        />
        <QuickPromptBar
          prompts={quickPrompts}
          visible={isInputVisible}
          onSelect={handleSelectQuickPrompt}
        />
      </div>

      <MobileMetaSheet
        open={metaSheetOpen}
        onOpenChange={setMetaSheetOpen}
        meta={metaWithCounts}
        toolCount={messageCounts?.toolCount ?? null}
        toolBreakdown={messageCounts?.toolBreakdown ?? null}
        branch={branch}
        isBranchLoading={isBranchLoading}
        sessionId={sessionId}
        gitStatus={gitStatus}
        tmuxInfo={tmuxInfo}
      />
    </div>
  );
};

export default MobileClaudeCodePanel;
