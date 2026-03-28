import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import useTimeline from '@/hooks/use-timeline';
import useSessionList from '@/hooks/use-session-list';
import useTabStore, { selectSessionView, isCliIdle } from '@/hooks/use-tab-store';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import useGitStatus from '@/hooks/use-git-status';
import useTmuxInfo from '@/hooks/use-tmux-info';
import SessionListView from '@/components/features/terminal/session-list-view';
import SessionEmptyView from '@/components/features/terminal/session-empty-view';
import TimelineView from '@/components/features/timeline/timeline-view';
import WebInputBar from '@/components/features/terminal/web-input-bar';
import QuickPromptBar from '@/components/features/terminal/quick-prompt-bar';
import { MetaCompact } from '@/components/features/terminal/session-meta-content';
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
  isRestarting?: boolean;
  onRestartComplete?: () => void;
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
  isRestarting,
  onRestartComplete,
}: IMobileClaudeCodePanelProps) => {
  const { prompts: quickPrompts } = useQuickPrompts();
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [metaSheetOpen, setMetaSheetOpen] = useState(false);
  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);

  const claudeStatus = useTabStore((s) => tabId ? s.tabs[tabId]?.claudeStatus ?? 'unknown' : 'unknown');

  const handleResumeStarted = useCallback(() => {
    setResumingSessionId(null);
    if (tabId) useTabStore.getState().setResuming(tabId, true);
  }, [tabId]);

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
    onSync: tabId ? (state) => {
      useTabStore.getState().setClaudeStatus(tabId, state.claudeStatus, Date.now());
      useTabStore.getState().setCliState(tabId, state.cliState);
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
    } : undefined,
  });

  const effectiveClaudeStatus = tabId
    ? claudeStatus
    : claudeStatusFromTimeline;

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
    enabled: !!sessionName && effectiveClaudeStatus !== 'running',
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

  const view = useTabStore((s) => tabId ? selectSessionView(s.tabs, tabId) : 'empty' as const);

  const { meta } = useSessionMeta(entries, sessionSummary, initMeta);
  const { branch, isLoading: isBranchLoading } = useGitBranch(sessionName);
  const { status: gitStatus } = useGitStatus(sessionName, metaSheetOpen);
  const tmuxInfo = useTmuxInfo(sessionName, metaSheetOpen);

  const restartNeedsExitRef = useRef(false);
  const prevIsRestartingRef = useRef(false);

  useEffect(() => {
    if (isRestarting && !prevIsRestartingRef.current) {
      restartNeedsExitRef.current = effectiveClaudeStatus === 'running';
    }
    prevIsRestartingRef.current = !!isRestarting;

    if (!isRestarting) return;

    if (restartNeedsExitRef.current && effectiveClaudeStatus !== 'running') {
      restartNeedsExitRef.current = false;
    }

    if (isCliIdle(cliState) && !restartNeedsExitRef.current) {
      onRestartComplete?.();
    }
  }, [isRestarting, effectiveClaudeStatus, cliState, onRestartComplete]);

  const isInputVisible = view === 'timeline';

  useEffect(() => {
    onCliStateChange(cliState);
  }, [cliState, onCliStateChange]);

  useEffect(() => {
    onInputVisibleChange(isInputVisible);
  }, [isInputVisible, onInputVisibleChange]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottomRef.current?.();
  }, []);

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

  if (view === 'restarting') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-muted">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">새 대화 만드는중...</span>
      </div>
    );
  }

  if (view === 'loading' || (view === 'inactive' && sessions.length === 0 && isSessionListLoading)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-muted">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (view === 'inactive') {
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
          cliState={cliState}
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

      <div className="shrink-0 pb-3">
        <WebInputBar
          tabId={tabId}
          wsId={wsId}
          cliState={cliState}
          sendStdin={sendStdin}
          terminalWsConnected={terminalWsConnected}
          visible={isInputVisible}
          focusTerminal={focusTerminal}
          focusInputRef={focusInputRef}
          setInputValueRef={setInputValueRef}
          maxRows={3}
          onRestartSession={onRestartSession}
          onSend={handleScrollToBottom}
        />
        <QuickPromptBar
          prompts={quickPrompts}
          cliState={cliState}
          visible={isInputVisible}
          onSelect={handleSelectQuickPrompt}
        />
      </div>

      <MobileMetaSheet
        open={metaSheetOpen}
        onOpenChange={setMetaSheetOpen}
        meta={meta}
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
