import { useEffect, useRef, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { AlertCircle, Bot, Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ChatBubble from '@/components/features/agent/chat-bubble';
import TypingIndicator from '@/components/features/agent/typing-indicator';
import NewMessageButton from '@/components/features/agent/new-message-button';
import type { IChatMessage, TAgentStatus } from '@/types/agent';

interface IMessageListProps {
  messages: IChatMessage[];
  agentStatus: TAgentStatus;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isAtBottom: boolean;
  isConnected: boolean;
  connectionError: boolean;
  loadError: boolean;
  failedMessageIds: Set<string>;
  onRetry: () => void;
  onLoadMore: () => void;
  onResend: (messageId: string) => void;
  onApproval: (action: '승인' | '거부') => void;
  onAtBottomChange: (val: boolean) => void;
}

const SkeletonMessages = () => (
  <div className="space-y-4 p-4">
    <div className="flex justify-start">
      <Skeleton className="h-12 w-48 rounded-2xl rounded-bl-md" />
    </div>
    <div className="flex justify-end">
      <Skeleton className="h-10 w-40 rounded-2xl rounded-br-md" />
    </div>
    <div className="flex justify-start">
      <Skeleton className="h-14 w-56 rounded-2xl rounded-bl-md" />
    </div>
  </div>
);

const ErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
    <AlertCircle className="h-8 w-8 text-negative/40" />
    <p className="text-sm text-muted-foreground">채팅 이력을 불러올 수 없습니다</p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      다시 시도
    </Button>
  </div>
);

const EmptyState = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
    <Bot className="h-8 w-8 text-muted-foreground/40" />
    <div className="text-center">
      <p className="text-sm text-muted-foreground">에이전트에게 첫 지시를</p>
      <p className="text-sm text-muted-foreground">내려보세요</p>
    </div>
    <p className="text-xs text-muted-foreground/60">
      예: &quot;A 프로젝트 README 정리해줘&quot;
    </p>
  </div>
);

const DateSeparator = ({ date }: { date: string }) => (
  <div className="my-4 flex items-center gap-3">
    <div className="h-px flex-1 bg-border" />
    <span className="shrink-0 text-[10px] text-muted-foreground">{date}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

const shouldShowDateSeparator = (current: IChatMessage, prev: IChatMessage | null): boolean => {
  if (!prev) return true;
  return !dayjs(current.timestamp).isSame(dayjs(prev.timestamp), 'day');
};

const formatDateSeparator = (timestamp: string): string => {
  const d = dayjs(timestamp);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.format('YYYY년 M월 D일')} (${days[d.day()]})`;
};

const MessageList = ({
  messages,
  agentStatus,
  isLoading,
  isLoadingMore,
  hasMore,
  isAtBottom,
  isConnected,
  connectionError,
  loadError,
  failedMessageIds,
  onRetry,
  onLoadMore,
  onResend,
  onApproval,
  onAtBottomChange,
}: IMessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const [lastSeenCount, setLastSeenCount] = useState(messages.length);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
          onLoadMore();
        }
      },
      { root: scrollRef.current, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Maintain scroll position after loading more
  useEffect(() => {
    if (!isLoadingMore && prevScrollHeightRef.current > 0 && scrollRef.current) {
      const newHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = newHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [isLoadingMore, messages.length]);

  // Auto-scroll on new messages when at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isAtBottom, agentStatus]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    onAtBottomChange(atBottom);
    if (atBottom) {
      setLastSeenCount(messages.length);
    }
  }, [onAtBottomChange, messages.length]);

  const handleScrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    onAtBottomChange(true);
    setLastSeenCount(messages.length);
  }, [onAtBottomChange, messages.length]);

  const hasNewMessage = !isAtBottom && messages.length > lastSeenCount;

  if (isLoading) {
    return (
      <div className="relative flex-1 overflow-hidden">
        <SkeletonMessages />
      </div>
    );
  }

  if (loadError && messages.length === 0) {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {connectionError && (
        <div className="flex items-center gap-2 bg-negative/10 px-4 py-2 text-xs text-negative">
          <WifiOff className="h-3 w-3" />
          연결할 수 없습니다. 새로고침해주세요
        </div>
      )}
      {!isConnected && !connectionError && (
        <div className="flex items-center gap-2 bg-negative/10 px-4 py-2 text-xs text-negative">
          <WifiOff className="h-3 w-3" />
          연결이 끊어졌습니다. 재연결 중...
        </div>
      )}

      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
        >
          <div className="space-y-3 p-4">
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-2">
                {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            )}

            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDate = shouldShowDateSeparator(msg, prev);

              return (
                <div key={msg.id}>
                  {showDate && <DateSeparator date={formatDateSeparator(msg.timestamp)} />}
                  <ChatBubble
                    message={msg}
                    isFailed={failedMessageIds.has(msg.id)}
                    onResend={() => onResend(msg.id)}
                    onApproval={msg.type === 'approval' ? onApproval : undefined}
                  />
                </div>
              );
            })}

            {agentStatus === 'working' && <TypingIndicator />}

            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {!isAtBottom && hasNewMessage && (
        <NewMessageButton onClick={handleScrollToBottom} />
      )}
    </div>
  );
};

export default MessageList;
