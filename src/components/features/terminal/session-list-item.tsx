import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ISessionMeta } from '@/types/timeline';

interface ISessionListItemProps {
  session: ISessionMeta;
  isHighlighted: boolean;
  isResuming: boolean;
  isDisabled: boolean;
  onSelect: (sessionId: string) => void;
}

const handleArrowNavigation = (e: React.KeyboardEvent<HTMLButtonElement>) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
    next?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = e.currentTarget.previousElementSibling as HTMLElement | null;
    prev?.focus();
  }
};

const formatRelativeTime = (dateStr: string): string => {
  const now = dayjs();
  const target = dayjs(dateStr);
  const diffMinutes = now.diff(target, 'minute');

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = now.diff(target, 'hour');
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = now.diff(target, 'day');
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;

  const diffWeeks = now.diff(target, 'week');
  if (diffWeeks < 4) return `${diffWeeks}주 전`;

  const diffMonths = now.diff(target, 'month');
  if (diffMonths < 12) return `${diffMonths}개월 전`;

  return `${now.diff(target, 'year')}년 전`;
};

const SessionListItem = ({
  session,
  isHighlighted,
  isResuming,
  isDisabled,
  onSelect,
}: ISessionListItemProps) => {
  const absoluteTime = dayjs(session.lastActivityAt).format('MM/DD HH:mm');
  const fullTime = dayjs(session.lastActivityAt).format('YYYY-MM-DD HH:mm:ss');
  const relativeTime = formatRelativeTime(session.lastActivityAt);
  const displayMessage = session.firstMessage || '(메시지 없음)';

  return (
    <button
      type="button"
      className={cn(
        'w-full cursor-pointer border-b border-border/50 px-4 py-3 text-left transition-colors',
        isHighlighted ? 'bg-ui-purple/5' : 'hover:bg-ui-purple/5',
        isDisabled && !isResuming && 'pointer-events-none opacity-50',
        isResuming && 'bg-ui-purple/5',
      )}
      onClick={() => onSelect(session.sessionId)}
      onKeyDown={handleArrowNavigation}
      disabled={isDisabled}
      aria-label={`세션: ${displayMessage}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          {isResuming ? (
            <Loader2
              size={14}
              className="shrink-0 animate-spin text-ui-purple"
            />
          ) : isHighlighted ? (
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ui-purple" />
          ) : (
            <span className="inline-block h-1.5 w-1.5 shrink-0" />
          )}
          <span
            className={cn(
              isHighlighted ? 'text-ui-purple' : 'text-muted-foreground',
            )}
          >
            {absoluteTime}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger
            className="shrink-0 text-xs text-muted-foreground"
            render={<span />}
          >
            {relativeTime}
          </TooltipTrigger>
          <TooltipContent side="left">
            <p className="text-xs">{fullTime}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-[18px]">
        <Tooltip>
          <TooltipTrigger
            className="min-w-0 truncate text-sm text-left"
            render={<span />}
          >
            {displayMessage}
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-[300px]">
            <p className="text-xs whitespace-pre-wrap break-words">{displayMessage}</p>
          </TooltipContent>
        </Tooltip>
        <span className="shrink-0 text-xs text-muted-foreground">
          {session.turnCount}턴
        </span>
      </div>
    </button>
  );
};

export default SessionListItem;
