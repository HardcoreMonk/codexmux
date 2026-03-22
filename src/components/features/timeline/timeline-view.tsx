import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Terminal, RefreshCw, Loader2, OctagonX, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type {
  ITimelineEntry,
  ITimelineToolCall,
  ITimelineToolResult,
  TCliState,
  TSessionStatus,
  TTimelineConnectionStatus,
} from '@/types/timeline';
import UserMessageItem from '@/components/features/timeline/user-message-item';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import AgentGroupItem from '@/components/features/timeline/agent-group-item';
import TaskNotificationItem from '@/components/features/timeline/task-notification-item';
import ToolGroupItem from '@/components/features/timeline/tool-group-item';
import ScrollToBottomButton from '@/components/features/timeline/scroll-to-bottom-button';

interface ITimelineViewProps {
  entries: ITimelineEntry[];
  sessionId: string | null;
  cliState: TCliState;
  sessionStatus: TSessionStatus;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
  isSessionTransitioning: boolean;
  error: string | null;
  isAutoScrollEnabled: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  onRetry: () => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
}

const SCROLL_THRESHOLD = 10;

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

const TimelineEntryRenderer = ({ entry }: { entry: ITimelineEntry }) => {
  switch (entry.type) {
    case 'user-message':
      return <UserMessageItem entry={entry} />;
    case 'assistant-message':
      return <AssistantMessageItem entry={entry} />;
    case 'agent-group':
      return <AgentGroupItem entry={entry} />;
    case 'task-notification':
      return <TaskNotificationItem entry={entry} />;
    case 'interrupt':
      return <InterruptItem />;
    case 'session-exit':
      return <SessionExitItem />;
    default:
      return null;
  }
};

const SkeletonLoader = ({ sessionId }: { sessionId?: string | null }) => (
  <div className="flex flex-col gap-4 p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
      <span>타임라인을 불러오는 중...</span>
    </div>
    {sessionId && (
      <p className="text-xs text-muted-foreground/60">({sessionId})</p>
    )}
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
  <div className="flex items-center justify-center gap-2 border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground">
    <Loader2 size={12} className="animate-spin" />
    연결이 끊어졌습니다. 재연결 중...
  </div>
);

const DisconnectedBanner = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex items-center justify-center gap-2 border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground">
    <span>연결 실패</span>
    <Button variant="outline" size="xs" className="h-5 px-2 text-xs" onClick={onRetry}>
      다시 시도
    </Button>
  </div>
);

const EmptyState = ({ sessionStatus }: { sessionStatus: TSessionStatus }) => {
  if (sessionStatus === 'not-installed') {
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

  if (sessionStatus === 'active') {
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
  sessionId,
  cliState,
  sessionStatus,
  wsStatus,
  isLoading,
  isSessionTransitioning,
  error,
  isAutoScrollEnabled,
  onAutoScrollChange,
  onRetry,
  onLoadMore,
  hasMore,
}: ITimelineViewProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isUserScrollingRef = useRef(false);
  const prevEntryCountRef = useRef(entries.length);
  const isInitialLoadRef = useRef(true);
  const [skipAnimation, setSkipAnimation] = useState(true);

  const groupedItems = useMemo(() => groupTimelineEntries(entries), [entries]);
  const hasDisplayItems = groupedItems.length > 0;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = parentRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;

    if (isAtBottom) {
      if (!isAutoScrollEnabled) {
        onAutoScrollChange(true);
      }
      setShowScrollButton(false);
    } else {
      if (isAutoScrollEnabled && isUserScrollingRef.current) {
        onAutoScrollChange(false);
        setShowScrollButton(true);
      }
    }
  }, [isAutoScrollEnabled, onAutoScrollChange]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const onWheel = () => { isUserScrollingRef.current = true; };
    const onTouchStart = () => { isUserScrollingRef.current = true; };
    const onScrollEnd = () => {
      setTimeout(() => { isUserScrollingRef.current = false; }, 100);
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('scrollend', onScrollEnd, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('scrollend', onScrollEnd);
    };
  }, []);

  useEffect(() => {
    const prevCount = prevEntryCountRef.current;
    if (entries.length > prevCount) {
      if (isAutoScrollEnabled) {
        const behavior = isInitialLoadRef.current ? 'instant' : 'smooth';
        isInitialLoadRef.current = false;
        requestAnimationFrame(() => scrollToBottom(behavior));
      }
    }
    prevEntryCountRef.current = entries.length;
  }, [entries.length, isAutoScrollEnabled, scrollToBottom]);

  useEffect(() => {
    setSkipAnimation(true);
    isInitialLoadRef.current = true;
  }, [sessionId]);

  useEffect(() => {
    if (skipAnimation && entries.length > 0) {
      scrollToBottom('instant');
      isInitialLoadRef.current = false;
      prevEntryCountRef.current = entries.length;
      requestAnimationFrame(() => setSkipAnimation(false));
    }
  }, [skipAnimation, entries.length, scrollToBottom]);

  const handleScrollToBottomClick = useCallback(() => {
    scrollToBottom('smooth');
    onAutoScrollChange(true);
    setShowScrollButton(false);
  }, [scrollToBottom, onAutoScrollChange]);

  const handleScrollForLoadMore = useCallback(() => {
    const el = parentRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop < 100) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  if (isLoading) {
    return <SkeletonLoader sessionId={sessionId} />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!hasDisplayItems) {
    return <EmptyState sessionStatus={sessionStatus} />;
  }

  const isReconnecting = wsStatus === 'reconnecting';
  const isDisconnected = wsStatus === 'disconnected';

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={parentRef}
        className={cn(
          'flex-1 overflow-y-auto py-2 transition-opacity',
          skipAnimation && '[&_.animate-in]:!duration-0',
        )}
        style={{
          opacity: isSessionTransitioning ? 0 : 1,
          transitionDuration: isSessionTransitioning ? '100ms' : '150ms',
        }}
        onScroll={() => {
          handleScroll();
          handleScrollForLoadMore();
        }}
        tabIndex={0}
        role="log"
        aria-label="Claude Code 타임라인"
      >
        {groupedItems.map((item) => (
          <div key={item.id} className="px-4 py-1.5">
            {item.type === 'tool-group' ? (
              <ToolGroupItem toolCalls={item.toolCalls} toolResults={item.toolResults} />
            ) : (
              <TimelineEntryRenderer entry={item.entry} />
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
      {isReconnecting && <ReconnectBanner />}
      {isDisconnected && <DisconnectedBanner onRetry={onRetry} />}
      <ScrollToBottomButton
        visible={showScrollButton}
        onClick={handleScrollToBottomClick}
      />
    </div>
  );
};

export default TimelineView;
