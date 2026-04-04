import { useEffect, useRef, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { useStickToBottom } from 'use-stick-to-bottom';
import { AlertCircle, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChatBubble from '@/components/features/agent/chat-bubble';
import ScrollToBottomButton from '@/components/features/timeline/scroll-to-bottom-button';
import type { IChatMessage, TAgentStatus } from '@/types/agent';

interface IMessageListProps {
  messages: IChatMessage[];
  agentStatus: TAgentStatus;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isConnected: boolean;
  connectionError: boolean;
  loadError: boolean;
  failedMessageIds: Set<string>;
  onRetry: () => void;
  onLoadMore: () => Promise<void>;
  onResend: (messageId: string) => void;
  onApproval: (action: '승인' | '거부') => void;
}

const SkeletonMessages = () => (
  <div className="flex flex-col gap-4 p-4">
    {[48, 36, 40].map((w, i) => (
      <div key={i} className="flex flex-col gap-2">
        <div className="h-4 animate-pulse rounded bg-ui-purple/20" style={{ width: `${w}%` }} />
        <div className="h-4 animate-pulse rounded bg-ui-purple/20" style={{ width: `${w - 10}%` }} />
      </div>
    ))}
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

const resolveApproval = (
  messages: IChatMessage[],
  index: number,
): 'approved' | 'rejected' | null => {
  for (let i = index + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user') {
      if (m.content === '승인') return 'approved';
      if (m.content === '거부') return 'rejected';
      return null;
    }
  }
  return null;
};

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
  isConnected,
  connectionError,
  loadError,
  failedMessageIds,
  onRetry,
  onLoadMore,
  onResend,
  onApproval,
}: IMessageListProps) => {
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    resize: { damping: 0.8, stiffness: 0.05 },
    initial: 'instant',
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const [isLoadingMoreLocal, setIsLoadingMoreLocal] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(true);

  useEffect(() => {
    if (skipAnimation && messages.length > 0) {
      scrollToBottom('instant');
      requestAnimationFrame(() => setSkipAnimation(false));
    }
  }, [skipAnimation, messages.length, scrollToBottom]);

  const triggerLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMoreLocal(true);
    onLoadMore().finally(() => {
      isLoadingMoreRef.current = false;
      setIsLoadingMoreLocal(false);
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
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-2 transition-opacity"
          style={{
            opacity: skipAnimation ? 0 : 1,
            transitionDuration: '300ms',
          }}
          role="log"
          aria-live="polite"
        >
          <div ref={contentRef} className="space-y-3 p-4">
            {hasMore && <div ref={sentinelRef} className="h-px" />}
            {hasMore && !isLoadingMoreLocal && !isLoadingMore && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={triggerLoadMore}>
                  <Loader2 size={12} className="mr-1" />
                  이전 내용 더보기
                </Button>
              </div>
            )}
            {(isLoadingMoreLocal || isLoadingMore) && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
                    approvalResolved={msg.type === 'approval' ? resolveApproval(messages, i) : undefined}
                    onResend={() => onResend(msg.id)}
                    onApproval={msg.type === 'approval' ? onApproval : undefined}
                  />
                </div>
              );
            })}

            {agentStatus === 'working' && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin text-ui-purple" />
                <span>응답 대기 중...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!isConnected && !connectionError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 size={12} className="animate-spin" />
            연결이 끊어졌습니다. 재연결 중...
          </div>
        </div>
      )}
      {connectionError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <span>연결 실패</span>
            <Button variant="outline" size="xs" className="h-5 rounded-full px-2 text-xs" onClick={onRetry}>
              다시 시도
            </Button>
          </div>
        </div>
      )}
      <ScrollToBottomButton
        visible={!isAtBottom}
        onClick={() => scrollToBottom('smooth')}
      />
    </div>
  );
};

export default MessageList;
