import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import { GitBranch, CircleDot, FilePen, FileQuestion, ArrowUp, ArrowDown, Archive } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTokenCount, formatTokenDetail, formatCost, formatModelDisplayName } from '@/lib/format-tokens';
import type { IGitStatus } from '@/lib/git-status';

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

export interface ITmuxInfo {
  cwd: string | null;
  command: string | null;
  lastCommand: string | null;
  pid: number | null;
  width: number | null;
  height: number | null;
  sessionCreated: number | null;
  sessionName: string;
}

export interface IMetaDetailProps {
  title: string;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fileSize: number;
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
  tmuxInfo?: ITmuxInfo | null;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const shortenPath = (p: string): string => {
  const home = typeof window === 'undefined' ? '' : '';
  if (!home) {
    const match = p.match(/^\/Users\/[^/]+(.*)$/);
    if (match) return `~${match[1]}`;
  }
  return p;
};

export const MetaDetail = ({
  title,
  sessionId,
  createdAt,
  updatedAt,
  fileSize,
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
  tmuxInfo,
}: IMetaDetailProps) => {
  const t = useTranslations('session.meta');
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
          <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('message')}</span>
          <span className="text-xs text-muted-foreground">
            {t('userAssistant', { userCount, assistantCount })}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('tokens')}</span>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-muted-foreground">
              {t('inputOutputTotal', { input: formatTokenDetail(inputTokens), output: formatTokenDetail(outputTokens), total: formatTokenDetail(totalTokens) })}
            </span>
            {tokensByModel.map((m) => (
              <span key={m.model} className="font-mono text-xs text-muted-foreground/60">
                {formatModelDisplayName(m.model)}
                {tokensByModel.length > 1 ? `: ${formatTokenCount(m.totalTokens)}` : ''}
                {m.cost !== null ? ` (${formatCost(m.cost)})` : ''}
              </span>
            ))}
          </div>
        </div>

        {totalCost !== null && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('cost')}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatCost(totalCost)}
            </span>
          </div>
        )}

        {createdAt && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('created')}</span>
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
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('updated')}</span>
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

        {fileSize > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground/70">JSONL</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatFileSize(fileSize)}
            </span>
          </div>
        )}
      </div>

      {tmuxInfo && (
        <div className="mt-1 border-t border-border pt-2">
          <div className="flex flex-col gap-1">
            {tmuxInfo.cwd && (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('path')}</span>
                <Tooltip>
                  <TooltipTrigger className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {shortenPath(tmuxInfo.cwd)}
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{tmuxInfo.cwd}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            {tmuxInfo.lastCommand && (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('process')}</span>
                <span className="font-mono text-xs text-muted-foreground">{tmuxInfo.lastCommand}</span>
              </div>
            )}
            {!tmuxInfo.lastCommand && tmuxInfo.command && (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('process')}</span>
                <span className="font-mono text-xs text-muted-foreground">{tmuxInfo.command}</span>
              </div>
            )}
            {tmuxInfo.pid && (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground/70">PID</span>
                <span className="font-mono text-xs text-muted-foreground">{tmuxInfo.pid}</span>
              </div>
            )}
            {tmuxInfo.width && tmuxInfo.height && (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('size')}</span>
                <span className="font-mono text-xs text-muted-foreground">{tmuxInfo.width} × {tmuxInfo.height}</span>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground/70">{t('session')}</span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">{tmuxInfo.sessionName}</span>
            </div>
          </div>
        </div>
      )}

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
