import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { GitBranch, CircleDot, FilePen, FileQuestion, ArrowUp, ArrowDown, Archive } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTokenCount, formatTokenDetail, formatCost } from '@/lib/format-tokens';
import type { IGitStatus } from '@/lib/git-status';

dayjs.extend(relativeTime);
dayjs.locale('ko');

export interface IModelTokens {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
}

const Separator = () => (
  <span className="mx-1.5 text-muted-foreground/50">·</span>
);

export const formatModelName = (model: string): string => {
  const match = model.match(/^claude-(\w+)-[\d.-]+/);
  return match ? match[1] : model;
};

export const MetaCompact = ({
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
    <div className="flex min-w-0 flex-1 items-center text-xs">
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
            <GitBranch size={12} className="shrink-0" />
            <span className="truncate font-mono">{branch}</span>
          </div>
        </>
      )}
      {totalCost !== null && (
        <>
          <Separator />
          <span className="shrink-0 font-mono text-muted-foreground">
            {formatCost(totalCost)}
          </span>
        </>
      )}
    </div>
  );
};

export interface IMetaDetailProps {
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
  gitStatus: IGitStatus | null;
}

export const MetaDetail = ({
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
  gitStatus,
}: IMetaDetailProps) => {
  const createdRelative = createdAt ? dayjs(createdAt).fromNow() : '';
  const updatedRelative = updatedAt ? dayjs(updatedAt).fromNow() : '';

  return (
    <div className="flex flex-col gap-1">
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

      {gitStatus && (
        <div className="mt-1 border-t border-border pt-2">
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">Git</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {gitStatus.staged > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs text-ui-green">
                  <CircleDot size={11} />
                  {gitStatus.staged} staged
                </span>
              )}
              {gitStatus.modified > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs text-ui-amber">
                  <FilePen size={11} />
                  {gitStatus.modified} modified
                </span>
              )}
              {gitStatus.untracked > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <FileQuestion size={11} />
                  {gitStatus.untracked} untracked
                </span>
              )}
              {gitStatus.ahead > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs text-ui-blue">
                  <ArrowUp size={11} />
                  {gitStatus.ahead} ahead
                </span>
              )}
              {gitStatus.behind > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs text-ui-purple">
                  <ArrowDown size={11} />
                  {gitStatus.behind} behind
                </span>
              )}
              {gitStatus.stash > 0 && (
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <Archive size={11} />
                  {gitStatus.stash} stash
                </span>
              )}
              {gitStatus.staged === 0 && gitStatus.modified === 0 && gitStatus.untracked === 0 &&
                gitStatus.ahead === 0 && gitStatus.behind === 0 && gitStatus.stash === 0 && (
                <span className="text-xs text-muted-foreground/50">clean</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
