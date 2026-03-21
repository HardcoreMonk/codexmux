import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { ChevronDown, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTokenCount, formatTokenDetail, formatCost } from '@/lib/format-tokens';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import type { ITimelineEntry } from '@/types/timeline';

dayjs.extend(relativeTime);
dayjs.locale('ko');

interface ISessionMetaBarProps {
  entries: ITimelineEntry[];
  sessionName: string;
  sessionId: string | null;
  sessionSummary?: string;
}

const RELATIVE_TIME_INTERVAL_MS = 60_000;

const Separator = () => (
  <span className="mx-1.5 text-muted-foreground/50">·</span>
);

const MetaBarCompact = ({
  title,
  totalCost,
  branch,
}: {
  title: string;
  totalCost: number | null;
  branch: string | null;
}) => {
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
      {branch && (
        <>
          <Separator />
          <div className="flex items-center gap-1 text-muted-foreground">
            <GitBranch size={12} />
            <span className="font-mono">{branch}</span>
          </div>
        </>
      )}
      {totalCost !== null && (
        <>
          <Separator />
          <span className="font-mono text-muted-foreground">
            {formatCost(totalCost)}
          </span>
        </>
      )}
    </div>
  );
};

interface IModelTokens {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
}

const formatModelName = (model: string): string => {
  const match = model.match(/^claude-(\w+)-[\d.-]+/);
  return match ? match[1] : model;
};

const MetaBarDetail = ({
  title,
  sessionId,
  createdAt,
  updatedAt,
  userCount,
  assistantCount,
  inputTokens,
  outputTokens,
  totalTokens,
  totalCost,
  tokensByModel,
  branch,
  isBranchLoading,
}: {
  title: string;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  userCount: number;
  assistantCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number | null;
  tokensByModel: IModelTokens[];
  branch: string | null;
  isBranchLoading: boolean;
}) => {
  const createdRelative = createdAt ? dayjs(createdAt).fromNow() : '';
  const updatedRelative = updatedAt ? dayjs(updatedAt).fromNow() : '';

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground/50">{sessionId}</span>
        <div className="flex items-center gap-1">
          {isBranchLoading && (
            <span className="text-xs text-muted-foreground/50">...</span>
          )}
          {!isBranchLoading && branch && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <GitBranch size={12} />
              <span className="font-mono text-xs">{branch}</span>
            </div>
          )}
        </div>
      </div>

      <span className="max-h-20 overflow-y-auto text-sm font-medium text-foreground">{title}</span>

        <div className="mt-1 flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">메시지</span>
            <span className="text-xs text-muted-foreground">
              사용자 {userCount} / 어시스턴트 {assistantCount}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">토큰</span>
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs text-muted-foreground">
                입력 {formatTokenDetail(inputTokens)} / 출력 {formatTokenDetail(outputTokens)} / 총 {formatTokenDetail(totalTokens)}
              </span>
              {tokensByModel.map((m) => (
                <span key={m.model} className="font-mono text-xs text-muted-foreground/60">
                  {formatModelName(m.model)}
                  {tokensByModel.length > 1 ? `: ${formatTokenCount(m.totalTokens)}` : ''}
                  {m.cost !== null ? ` (${formatCost(m.cost)})` : ''}
                </span>
              ))}
            </div>
          </div>

          {totalCost !== null && (
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground/70">비용</span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatCost(totalCost)}
              </span>
            </div>
          )}

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
        </div>
    </div>
  );
};

const SessionMetaBar = ({ entries, sessionName, sessionId, sessionSummary }: ISessionMetaBarProps) => {
  const { meta, isExpanded, toggleExpanded, collapse } = useSessionMeta(entries, sessionSummary);
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
    <div ref={containerRef} className="relative shrink-0 border-b">
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-1.5 hover:bg-muted/30"
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
        <MetaBarCompact
          title={meta.title}
          totalCost={meta.totalCost}
          branch={branch}
        />
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-150',
            isExpanded && 'rotate-180',
          )}
        />
      </div>
      <div
        className={cn(
          'absolute inset-x-0 top-full z-10 origin-top border-b bg-background shadow-sm transition-all duration-150 ease-out',
          isExpanded
            ? 'scale-y-100 opacity-100'
            : 'pointer-events-none scale-y-95 opacity-0',
        )}
      >
        <MetaBarDetail
          title={meta.title}
          sessionId={sessionId}
          createdAt={meta.createdAt}
          updatedAt={meta.updatedAt}
          userCount={meta.userCount}
          assistantCount={meta.assistantCount}
          inputTokens={meta.inputTokens}
          outputTokens={meta.outputTokens}
          totalTokens={meta.totalTokens}
          totalCost={meta.totalCost}
          tokensByModel={meta.tokensByModel}
          branch={branch}
          isBranchLoading={isBranchLoading}
        />
      </div>
    </div>
  );
};

export default SessionMetaBar;
