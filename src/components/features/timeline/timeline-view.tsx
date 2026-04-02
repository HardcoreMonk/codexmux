import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Terminal, RefreshCw, Loader2, OctagonX, LogOut } from 'lucide-react';
import { useStickToBottom } from 'use-stick-to-bottom';
import { Button } from '@/components/ui/button';
import type {
  ITimelineEntry,
  ITimelineToolCall,
  ITimelineToolResult,
  ITaskItem,
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

interface ITimelineViewProps {
  entries: ITimelineEntry[];
  tasks: ITaskItem[];
  sessionId: string | null;
  sessionName?: string;
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

const ElapsedTime = ({ since }: { since: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - since) / 1000));
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

const InterruptItem = () => (
  <div className="flex items-center justify-end gap-1.5 py-1 text-xs text-muted-foreground/60">
    <OctagonX size={12} />
    <span>요청 취소됨</span>
  </div>
);

const SessionExitItem = () => (
  <div className="flex items-center justify-end gap-1.5 py-1 text-xs text-muted-foreground/60">
    <LogOut size={12} />
    <span>세션 종료(/exit)</span>
  </div>
);

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
        <div className="h-4 animate-pulse rounded bg-ui-purple/20" style={{ width: `${w}%` }} />
        <div className="h-4 animate-pulse rounded bg-ui-purple/20" style={{ width: `${w - 10}%` }} />
      </div>
    ))}
  </div>
);

const ErrorState = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
    <Terminal size={32} className="opacity-40" />
    <div className="text-center">
      <p className="text-sm font-medium">연결 오류</p>
      <p className="mt-1 text-xs">{error}</p>
    </div>
    <Button variant="outline" size="xs" onClick={onRetry}>
      <RefreshCw size={12} />
      다시 시도
    </Button>
  </div>
);

const ReconnectBanner = () => (
  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
      <Loader2 size={12} className="animate-spin" />
      연결이 끊어졌습니다. 재연결 중...
    </div>
  </div>
);

const DisconnectedBanner = ({ onRetry }: { onRetry: () => void }) => (
  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
      <span>연결 실패</span>
      <Button variant="outline" size="xs" className="h-5 rounded-full px-2 text-xs" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  </div>
);

const EmptyState = ({ claudeStatus }: { claudeStatus: TClaudeStatus }) => {
  if (claudeStatus === 'not-installed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Terminal size={32} className="opacity-40" />
        <div className="text-center">
          <p className="text-sm font-medium">Claude Code를 설치하세요</p>
          <p className="mt-1 text-xs">~/.claude 디렉토리를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  if (claudeStatus === 'running') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Terminal size={32} className="opacity-40" />
        <p className="text-xs">메시지를 입력하면 타임라인이 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Terminal size={32} className="opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium">Claude Code가 실행 중이지 않습니다</p>
        <p className="mt-1 text-xs">
          현재 터미널에서 Claude Code를<br />실행하면 타임라인이 표시됩니다.
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

  useEffect(() => {
    if (skipAnimation && entries.length > 0) {
      scrollToBottom('instant');
      requestAnimationFrame(() => setSkipAnimation(false));
    }
  }, [skipAnimation, entries.length, scrollToBottom]);

  const isLoadingMoreRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const triggerLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    onLoadMore().finally(() => {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    });
  }, [hasMore, onLoadMore]);

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
        aria-label="Claude Code 타임라인"
      >
        <div ref={contentRef}>
          {hasMore && <div ref={sentinelRef} className="h-px" />}
          {hasMore && !isLoadingMore && (
            <div className="flex justify-center py-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={triggerLoadMore}>
                <Loader2 size={12} className="mr-1" />
                이전 내용 더보기
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
          {cliState === 'busy' && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin text-ui-purple" />
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
