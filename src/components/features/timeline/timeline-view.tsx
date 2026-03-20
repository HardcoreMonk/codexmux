import { useRef, useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageSquare, RefreshCw, Loader2 } from 'lucide-react';
import type { ITimelineEntry, TSessionStatus, TTimelineConnectionStatus } from '@/types/timeline';
import UserMessageItem from '@/components/features/timeline/user-message-item';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import ToolCallItem from '@/components/features/timeline/tool-call-item';
import AgentGroupItem from '@/components/features/timeline/agent-group-item';
import ScrollToBottomButton from '@/components/features/timeline/scroll-to-bottom-button';

interface ITimelineViewProps {
  entries: ITimelineEntry[];
  sessionStatus: TSessionStatus;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
  error: string | null;
  isAutoScrollEnabled: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  onRetry: () => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
}

const SCROLL_THRESHOLD = 10;

const TimelineEntryRenderer = ({ entry }: { entry: ITimelineEntry }) => {
  switch (entry.type) {
    case 'user-message':
      return <UserMessageItem entry={entry} />;
    case 'assistant-message':
      return <AssistantMessageItem entry={entry} />;
    case 'tool-call':
      return <ToolCallItem entry={entry} />;
    case 'agent-group':
      return <AgentGroupItem entry={entry} />;
    case 'tool-result':
      return null;
    default:
      return null;
  }
};

const SkeletonLoader = () => (
  <div className="flex flex-col gap-4 p-4">
    {[48, 36, 40, 32, 44].map((w, i) => (
      <div key={i} className="flex flex-col gap-2">
        <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
        <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${w - 10}%` }} />
      </div>
    ))}
  </div>
);

const ErrorState = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
    <MessageSquare size={32} className="opacity-40" />
    <div className="text-center">
      <p className="text-sm font-medium">연결 오류</p>
      <p className="mt-1 text-xs">{error}</p>
    </div>
    <button
      type="button"
      className="mt-2 flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs transition-colors hover:bg-muted"
      onClick={onRetry}
    >
      <RefreshCw size={12} />
      다시 시도
    </button>
  </div>
);

const ReconnectBanner = () => (
  <div className="flex items-center justify-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
    <Loader2 size={12} className="animate-spin" />
    연결이 끊어졌습니다. 재연결 중...
  </div>
);

const EmptyState = ({ sessionStatus }: { sessionStatus: TSessionStatus }) => {
  if (sessionStatus === 'not-installed') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <MessageSquare size={32} className="opacity-40" />
        <div className="text-center">
          <p className="text-sm font-medium">Claude Code 미설치</p>
          <p className="mt-1 text-xs">Claude Code를 설치하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageSquare size={32} className="opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium">Claude Code 세션 없음</p>
        <p className="mt-1 text-xs">
          이 프로젝트에서 Claude Code<br />세션이 아직 없습니다.
        </p>
      </div>
    </div>
  );
};

const TimelineView = ({
  entries,
  sessionStatus,
  wsStatus,
  isLoading,
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

  const displayEntries = entries.filter((e) => e.type !== 'tool-result');

  const virtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

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
    if (entries.length > prevEntryCountRef.current && isAutoScrollEnabled) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    }
    prevEntryCountRef.current = entries.length;
  }, [entries.length, isAutoScrollEnabled, scrollToBottom]);

  useEffect(() => {
    if (entries.length > 0 && isAutoScrollEnabled) {
      requestAnimationFrame(() => scrollToBottom('instant'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    return <SkeletonLoader />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (displayEntries.length === 0) {
    return <EmptyState sessionStatus={sessionStatus} />;
  }

  const isReconnecting = wsStatus === 'reconnecting';

  return (
    <div className="relative flex h-full flex-col">
      {isReconnecting && <ReconnectBanner />}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          handleScroll();
          handleScrollForLoadMore();
        }}
        tabIndex={0}
        role="log"
        aria-label="Claude Code 타임라인"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const entry = displayEntries[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="px-4 py-2">
                  <TimelineEntryRenderer entry={entry} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ScrollToBottomButton
        visible={showScrollButton}
        onClick={handleScrollToBottomClick}
      />
    </div>
  );
};

export default TimelineView;
