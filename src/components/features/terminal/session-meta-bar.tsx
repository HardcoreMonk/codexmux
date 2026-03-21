import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTokenCount, formatTokenDetail } from '@/lib/format-tokens';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import type { ITimelineEntry } from '@/types/timeline';

dayjs.extend(relativeTime);
dayjs.locale('ko');

interface ISessionMetaBarProps {
  entries: ITimelineEntry[];
  sessionName: string;
}

const RELATIVE_TIME_INTERVAL_MS = 60_000;

const Separator = () => (
  <span className="mx-1.5 text-muted-foreground/50">·</span>
);

const MetaBarCompact = ({
  title,
  updatedAt,
  userCount,
  totalTokens,
}: {
  title: string;
  updatedAt: string | null;
  userCount: number;
  totalTokens: number;
}) => {
  const relativeTime = updatedAt ? dayjs(updatedAt).fromNow() : '-';
  const truncatedTitle = title.length > 30 ? `${title.slice(0, 30)}…` : title;

  return (
    <div className="flex items-center text-xs">
      <Tooltip>
        <TooltipTrigger className="max-w-[200px] truncate text-sm font-medium text-foreground">
          {truncatedTitle}
        </TooltipTrigger>
        {title.length > 30 && (
          <TooltipContent side="bottom" className="max-w-[300px]">
            <p className="text-xs">{title}</p>
          </TooltipContent>
        )}
      </Tooltip>
      <Separator />
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground">
          {relativeTime}
        </TooltipTrigger>
        {updatedAt && (
          <TooltipContent side="bottom">
            <p className="text-xs">{dayjs(updatedAt).format('YYYY-MM-DD HH:mm:ss')}</p>
          </TooltipContent>
        )}
      </Tooltip>
      <Separator />
      <span className="text-muted-foreground">{userCount}턴</span>
      <Separator />
      <span className="font-mono text-muted-foreground">
        {formatTokenCount(totalTokens)}
      </span>
    </div>
  );
};

const MetaBarDetail = ({
  title,
  createdAt,
  updatedAt,
  userCount,
  assistantCount,
  inputTokens,
  outputTokens,
  totalTokens,
  branch,
  isBranchLoading,
}: {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  userCount: number;
  assistantCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  branch: string | null;
  isBranchLoading: boolean;
}) => {
  const createdRelative = createdAt ? dayjs(createdAt).fromNow() : '';
  const updatedRelative = updatedAt ? dayjs(updatedAt).fromNow() : '';

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{title}</span>

      <div className="mt-1 flex flex-col gap-1">
        {createdAt && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">생성</span>
            <Tooltip>
              <TooltipTrigger className="text-xs text-muted-foreground">
                {dayjs(createdAt).format('MM/DD HH:mm')} ({createdRelative})
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">{dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {updatedAt && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">수정</span>
            <Tooltip>
              <TooltipTrigger className="text-xs text-muted-foreground">
                {dayjs(updatedAt).format('MM/DD HH:mm')} ({updatedRelative})
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">{dayjs(updatedAt).format('YYYY-MM-DD HH:mm:ss')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className="w-12 shrink-0 text-xs text-muted-foreground/70">메시지</span>
          <span className="text-xs text-muted-foreground">
            사용자 {userCount} / 어시스턴트 {assistantCount}
          </span>
        </div>

        {isBranchLoading && (
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70" />
            <span className="text-xs text-muted-foreground/50">로드 중...</span>
          </div>
        )}

        {!isBranchLoading && branch && (
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70" />
            <div className="flex items-center gap-1">
              <GitBranch size={12} className="text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground">{branch}</span>
            </div>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className="w-12 shrink-0 text-xs text-muted-foreground/70">토큰</span>
          <span className="font-mono text-xs text-muted-foreground">
            입력 {formatTokenDetail(inputTokens)} / 출력 {formatTokenDetail(outputTokens)} / 총 {formatTokenDetail(totalTokens)}
          </span>
        </div>
      </div>
    </div>
  );
};

const SessionMetaBar = ({ entries, sessionName }: ISessionMetaBarProps) => {
  const { meta, isExpanded, toggleExpanded, collapse } = useSessionMeta(entries);
  const { branch, isLoading: isBranchLoading } = useGitBranch(sessionName);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        collapse();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        collapse();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isExpanded, collapse]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'shrink-0 border-b transition-colors duration-150 ease-out',
        isExpanded ? 'bg-muted/30' : 'cursor-pointer hover:bg-muted/30',
      )}
      role="button"
      tabIndex={0}
      onClick={toggleExpanded}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleExpanded();
        }
      }}
    >
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-150 ease-out',
          isExpanded ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-1.5">
            <MetaBarCompact
              title={meta.title}
              updatedAt={meta.updatedAt}
              userCount={meta.userCount}
              totalTokens={meta.totalTokens}
            />
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          </div>
        </div>
      </div>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-150 ease-out',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-start justify-between">
              <MetaBarDetail
                title={meta.title}
                createdAt={meta.createdAt}
                updatedAt={meta.updatedAt}
                userCount={meta.userCount}
                assistantCount={meta.assistantCount}
                inputTokens={meta.inputTokens}
                outputTokens={meta.outputTokens}
                totalTokens={meta.totalTokens}
                branch={branch}
                isBranchLoading={isBranchLoading}
              />
              <ChevronUp size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionMetaBar;
