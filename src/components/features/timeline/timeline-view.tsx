import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Terminal, RefreshCw, OctagonX, LogOut, ChevronsUp, MessageSquareMore } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { useStickToBottom } from 'use-stick-to-bottom';
import { Button } from '@/components/ui/button';
import type {
  ITimelineEntry,
  ITimelineToolCall,
  ITimelineToolResult,
  ITaskItem,
  IInitMeta,
  TCliState,
  TClaudeStatus,
  TTimelineConnectionStatus,
} from '@/types/timeline';
import UserMessageItem from '@/components/features/timeline/user-message-item';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import AgentGroupItem from '@/components/features/timeline/agent-group-item';
import TaskNotificationItem from '@/components/features/timeline/task-notification-item';
import ToolGroupItem from '@/components/features/timeline/tool-group-item';
import PlanItem from '@/components/features/timeline/plan-item';
import AskUserQuestionItem from '@/components/features/timeline/ask-user-question-item';
import TaskChecklist from '@/components/features/timeline/task-checklist';
import TaskProgressItem from '@/components/features/timeline/task-progress-item';
import ScrollToBottomButton from '@/components/features/timeline/scroll-to-bottom-button';
import PermissionPromptItem from '@/components/features/timeline/permission-prompt-item';

interface ITimelineViewProps {
  entries: ITimelineEntry[];
  tasks: ITaskItem[];
  sessionId: string | null;
  sessionName?: string;
  initMeta?: IInitMeta;
  cliState: TCliState;
  claudeStatus: TClaudeStatus;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
}

const RESUME_TOKEN_THRESHOLD = 100_000;
const RESUME_IDLE_MINUTES = 70;

const ElapsedTime = ({ since }: { since: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return <span className="tabular-nums">{mm}:{ss}</span>;
};

type TGroupedItem =
  | { type: 'entry'; id: string; entry: ITimelineEntry }
  | { type: 'tool-group'; id: string; toolCalls: ITimelineToolCall[]; toolResults: ITimelineToolResult[] };

const groupTimelineEntries = (entries: ITimelineEntry[]): TGroupedItem[] => {
  const result: TGroupedItem[] = [];
  let toolCallBuffer: ITimelineToolCall[] = [];
  let toolResultBuffer: ITimelineToolResult[] = [];

  const flushToolBuffer = () => {
    if (toolCallBuffer.length > 0) {
      result.push({
        type: 'tool-group',
        id: toolCallBuffer[0].id,
        toolCalls: [...toolCallBuffer],
        toolResults: [...toolResultBuffer],
      });
      toolCallBuffer = [];
      toolResultBuffer = [];
    }
  };

  for (const entry of entries) {
    if (entry.type === 'tool-call') {
      toolCallBuffer.push(entry);
    } else if (entry.type === 'tool-result') {
      toolResultBuffer.push(entry);
    } else {
      flushToolBuffer();
      result.push({ type: 'entry', id: entry.id, entry });
    }
  }

  flushToolBuffer();
  return result;
};

const InterruptItem = () => {
  const t = useTranslations('timeline');
  return (
    <div className="flex items-center justify-end gap-1.5 py-1 text-xs text-muted-foreground/60">
      <OctagonX size={12} />
      <span>{t('requestCancelled')}</span>
    </div>
  );
};

const SessionExitItem = () => {
  const t = useTranslations('timeline');
  return (
    <div className="flex items-center justify-end gap-1.5 py-1 text-xs text-muted-foreground/60">
      <LogOut size={12} />
      <span>{t('sessionExit')}</span>
    </div>
  );
};

const TimelineEntryRenderer = ({ entry, sessionName }: { entry: ITimelineEntry; sessionName?: string }) => {
  switch (entry.type) {
    case 'user-message':
      return <UserMessageItem entry={entry} />;
    case 'assistant-message':
      return <AssistantMessageItem entry={entry} />;
    case 'agent-group':
      return <AgentGroupItem entry={entry} />;
    case 'task-notification':
      return <TaskNotificationItem entry={entry} />;
    case 'plan':
      return <PlanItem entry={entry} sessionName={sessionName} />;
    case 'ask-user-question':
      return <AskUserQuestionItem entry={entry} sessionName={sessionName} />;
    case 'task-progress':
      return <TaskProgressItem entry={entry} />;
    case 'interrupt':
      return <InterruptItem />;
    case 'session-exit':
      return <SessionExitItem />;
    default:
      return null;
  }
};

const SkeletonLoader = () => (
  <div className="flex flex-col gap-4 p-4">
    {[48, 36, 40].map((w, i) => (
      <div key={i} className="flex flex-col gap-2">
        <div className="h-4 animate-pulse rounded bg-claude-active/20" style={{ width: `${w}%` }} />
        <div className="h-4 animate-pulse rounded bg-claude-active/20" style={{ width: `${w - 10}%` }} />
      </div>
    ))}
  </div>
);

const ErrorState = ({ error, onRetry }: { error: string; onRetry: () => void }) => {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Terminal size={32} className="opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium">{t('connectionError')}</p>
        <p className="mt-1 text-xs">{error}</p>
      </div>
      <Button variant="outline" size="xs" onClick={onRetry}>
        <RefreshCw size={12} />
        {tc('retry')}
      </Button>
    </div>
  );
};

const ReconnectBanner = () => {
  const t = useTranslations('timeline');
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
        <Spinner size={10} />
        {t('reconnecting')}
      </div>
    </div>
  );
};

const DisconnectedBanner = ({ onRetry }: { onRetry: () => void }) => {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
        <span>{t('connectionFailed')}</span>
        <Button variant="outline" size="xs" className="h-5 rounded-full px-2 text-xs" onClick={onRetry}>
          {tc('retry')}
        </Button>
      </div>
    </div>
  );
};

const EmptyState = ({ claudeStatus }: { claudeStatus: TClaudeStatus }) => {
  const t = useTranslations('timeline');

  if (claudeStatus === 'not-installed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Terminal size={32} className="opacity-40" />
        <div className="text-center">
          <p className="text-sm font-medium">{t('installClaude')}</p>
          <p className="mt-1 text-xs">{t('installClaudeHint')}</p>
        </div>
      </div>
    );
  }

  if (claudeStatus === 'running') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <MessageSquareMore size={32} className="opacity-40" />
        <p className="text-xs">{t('emptyRunning')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Terminal size={32} className="opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium">{t('notRunningTitle')}</p>
        <p className="mt-1 text-xs">
          {t('notRunningHint')}<br />{t('notRunningHint2')}
        </p>
      </div>
    </div>
  );
};

const TimelineView = ({
  entries,
  tasks,
  sessionId,
  sessionName,
  initMeta,
  cliState,
  claudeStatus,
  wsStatus,
  isLoading,
  error,
  onRetry,
  onLoadMore,
  hasMore,
  scrollToBottomRef,
}: ITimelineViewProps) => {
  const t = useTranslations('timeline');
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    resize: { damping: 0.8, stiffness: 0.05 },
    initial: 'instant',
  });
  const [skipAnimation, setSkipAnimation] = useState(true);
  const [prevSessionId, setPrevSessionId] = useState(sessionId);

  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    setSkipAnimation(true);
  }

  useEffect(() => {
    if (!scrollToBottomRef) return;
    scrollToBottomRef.current = () => {
      scrollToBottom('smooth');
      setTimeout(() => scrollToBottom('smooth'), 300);
    };
    return () => { scrollToBottomRef.current = undefined; };
  }, [scrollToBottomRef, scrollToBottom]);

  const groupedItems = useMemo(() => groupTimelineEntries(entries), [entries]);
  const hasDisplayItems = groupedItems.length > 0;

  const [showDialogPrompt, setShowDialogPrompt] = useState(false);
  const dialogDepsKey = `${cliState}:${initMeta?.contextWindowTokens ?? 0}:${initMeta?.lastTimestamp ?? 0}:${sessionName ?? ''}`;

  useEffect(() => {
    if (cliState !== 'idle' || !initMeta || !sessionName
      || initMeta.contextWindowTokens < RESUME_TOKEN_THRESHOLD
      || !initMeta.lastTimestamp) {
      setShowDialogPrompt(false);
      return;
    }

    const check = () => {
      const idleMinutes = (Date.now() - initMeta.lastTimestamp) / 60_000;
      setShowDialogPrompt(idleMinutes >= RESUME_IDLE_MINUTES);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogDepsKey]);

  useEffect(() => {
    if (skipAnimation && entries.length > 0) {
      scrollToBottom('instant');
      requestAnimationFrame(() => setSkipAnimation(false));
    }
  }, [skipAnimation, entries.length, scrollToBottom]);

  const isLoadingMoreRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const needsManualAnchor = typeof CSS !== 'undefined' && !CSS.supports?.('overflow-anchor', 'auto');
  const scrollAnchorRef = useRef<{ scrollHeight: number } | null>(null);

  const triggerLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    if (needsManualAnchor) {
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        scrollAnchorRef.current = { scrollHeight: scrollEl.scrollHeight };
      }
    }

    onLoadMore().finally(() => {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    });
  }, [hasMore, onLoadMore, scrollRef, needsManualAnchor]);

  useLayoutEffect(() => {
    if (!needsManualAnchor) return;

    const anchor = scrollAnchorRef.current;
    const scrollEl = scrollRef.current;
    if (!anchor || !scrollEl || isLoadingMore) return;

    const heightDiff = scrollEl.scrollHeight - anchor.scrollHeight;
    if (heightDiff > 0) {
      scrollEl.scrollTop += heightDiff;
    }
    scrollAnchorRef.current = null;
  }, [isLoadingMore, scrollRef, needsManualAnchor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          triggerLoadMore();
        }
      },
      { root, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, triggerLoadMore]);

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!hasDisplayItems) {
    return <EmptyState claudeStatus={claudeStatus} />;
  }

  const isReconnecting = wsStatus === 'reconnecting';
  const isDisconnected = wsStatus === 'disconnected';

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-2 transition-opacity"
        style={{
          opacity: skipAnimation ? 0 : 1,
          transitionDuration: '300ms',
        }}
        tabIndex={0}
        role="log"
        aria-label={t('timelineAria')}
      >
        <div ref={contentRef} className="mx-auto max-w-content">
          {hasMore && <div ref={sentinelRef} className="h-px" />}
          {hasMore && !isLoadingMore && (
            <div className="flex justify-center py-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={triggerLoadMore}>
                <ChevronsUp size={12} className="mr-1" />
                {t('loadMore')}
              </Button>
            </div>
          )}
          {isLoadingMore && (
            <div className="flex flex-col gap-3 px-4 py-3">
              {[44, 32, 48].map((w, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-3.5 animate-pulse rounded bg-muted/60" style={{ width: `${w}%` }} />
                  <div className="h-3.5 animate-pulse rounded bg-muted/60" style={{ width: `${w - 12}%` }} />
                </div>
              ))}
            </div>
          )}
          {tasks.length > 0 && (
            <TaskChecklist tasks={tasks} cliState={cliState} />
          )}
          {groupedItems.map((item) => (
            <div key={item.id} className="px-4 py-1.5">
              {item.type === 'tool-group' ? (
                <ToolGroupItem toolCalls={item.toolCalls} toolResults={item.toolResults} sessionName={sessionName} />
              ) : (
                <TimelineEntryRenderer entry={item.entry} sessionName={sessionName} />
              )}
            </div>
          ))}
          {showDialogPrompt && sessionName && (
            <div className="px-4 py-1.5">
              <PermissionPromptItem sessionName={sessionName} />
            </div>
          )}
          {cliState === 'busy' && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <Spinner size={10} className="text-claude-active" />
              <ElapsedTime since={entries[entries.length - 1].timestamp} />
            </div>
          )}
        </div>
      </div>
      {isReconnecting && <ReconnectBanner />}
      {isDisconnected && <DisconnectedBanner onRetry={onRetry} />}
      <ScrollToBottomButton
        visible={!isAtBottom}
        onClick={() => scrollToBottom('smooth')}
      />
    </div>
  );
};

export default TimelineView;
