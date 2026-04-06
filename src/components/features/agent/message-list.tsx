import { useEffect, useRef, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useStickToBottom } from 'use-stick-to-bottom';
import { AlertCircle, Bot } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import ChatBubble from '@/components/features/agent/chat-bubble';
import ScrollToBottomButton from '@/components/features/timeline/scroll-to-bottom-button';
import type { IChatMessage, TAgentStatus } from '@/types/agent';

interface IMessageListProps {
  messages: IChatMessage[];
  agentStatus: TAgentStatus;
  lastActivity: string | null;
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
  onApproval: (action: 'approve' | 'reject') => void;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
}

const SkeletonMessages = () => (
  <div className="flex flex-col gap-4 p-4">
    {[48, 36, 40].map((w, i) => (
      <div key={i} className="flex flex-col gap-2">
        <div className="h-4 animate-pulse rounded bg-claude-active/20" style={{ width: `${w}%` }} />
        <div className="h-4 animate-pulse rounded bg-claude-active/20" style={{ width: `${w - 10}%` }} />
      </div>
    ))}
  </div>
);

const ErrorState = ({ onRetry }: { onRetry: () => void }) => {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <AlertCircle className="h-8 w-8 text-negative/40" />
      <p className="text-sm text-muted-foreground">{t('loadError')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {tc('retry')}
      </Button>
    </div>
  );
};

const EmptyState = () => {
  const t = useTranslations('agent');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <Bot className="h-8 w-8 text-muted-foreground/40" />
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{t('emptyTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('emptySubtitle')}</p>
      </div>
      <p className="text-xs text-muted-foreground/60">
        {t('emptyExample')}
      </p>
    </div>
  );
};

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
      if (m.content === 'approve' || m.content === '승인') return 'approved';
      if (m.content === 'reject' || m.content === '거부') return 'rejected';
      return null;
    }
  }
  return null;
};

const shouldShowDateSeparator = (current: IChatMessage, prev: IChatMessage | null): boolean => {
  if (!prev) return true;
  return !dayjs(current.timestamp).isSame(dayjs(prev.timestamp), 'day');
};

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatDateSeparator = (timestamp: string, locale: string): string => {
  const d = dayjs(timestamp);
  if (locale === 'ko') {
    return `${d.format('YYYY년 M월 D일')} (${WEEKDAYS_KO[d.day()]})`;
  }
  return `${WEEKDAYS_EN[d.day()]}, ${d.format('MMM D, YYYY')}`;
};

const MessageList = ({
  messages,
  agentStatus,
  lastActivity,
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
  scrollToBottomRef,
}: IMessageListProps) => {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  const locale = useLocale();
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

  // 입력창 높이 변화로 스크롤 컨테이너 뷰포트가 줄어들 때 바닥 유지
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let prevHeight = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h < prevHeight && isAtBottom) {
        scrollToBottom('instant');
      }
      prevHeight = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, isAtBottom, scrollToBottom]);

  useEffect(() => {
    if (!scrollToBottomRef) return;
    scrollToBottomRef.current = () => {
      scrollToBottom('smooth');
      setTimeout(() => scrollToBottom('smooth'), 300);
    };
    return () => { scrollToBottomRef.current = undefined; };
  }, [scrollToBottomRef, scrollToBottom]);

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
          <div ref={contentRef} className="mx-auto max-w-content space-y-3 p-4">
            {hasMore && <div ref={sentinelRef} className="h-px" />}
            {hasMore && !isLoadingMoreLocal && !isLoadingMore && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={triggerLoadMore}>
                  <Spinner size={10} className="mr-1" />
                  {t('loadMore')}
                </Button>
              </div>
            )}
            {(isLoadingMoreLocal || isLoadingMore) && (
              <div className="flex justify-center py-2">
                <Spinner className="h-3 w-3 text-muted-foreground" />
              </div>
            )}

            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDate = shouldShowDateSeparator(msg, prev);

              return (
                <div key={msg.id}>
                  {showDate && <DateSeparator date={formatDateSeparator(msg.timestamp, locale)} />}
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

            {agentStatus === 'working' && lastActivity && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Spinner size={10} className="text-claude-active" />
                <span>{lastActivity}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!isConnected && !connectionError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <Spinner size={10} />
            {t('reconnecting')}
          </div>
        </div>
      )}
      {connectionError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <span>{t('connectionFailed')}</span>
            <Button variant="outline" size="xs" className="h-5 rounded-full px-2 text-xs" onClick={onRetry}>
              {tc('retry')}
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
