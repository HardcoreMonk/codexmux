import { useState, memo } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, ChevronRight, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ITimelineTaskNotification } from '@/types/timeline';

interface ITaskNotificationItemProps {
  entry: ITimelineTaskNotification;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const TaskNotificationItem = ({ entry }: ITaskNotificationItemProps) => {
  const t = useTranslations('timeline');
  const [isExpanded, setIsExpanded] = useState(false);
  const isSuccess = entry.status === 'completed';
  const hasDetail = !!entry.result;

  return (
    <div className="animate-in fade-in duration-150">
      <button
        className={cn(
          'flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors',
          hasDetail && 'hover:text-foreground',
        )}
        onClick={() => hasDetail && setIsExpanded((prev) => !prev)}
        disabled={!hasDetail}
      >
        {hasDetail ? (
          <ChevronRight
            size={14}
            className={cn(
              'shrink-0 transition-transform duration-150',
              isExpanded && 'rotate-90',
            )}
          />
        ) : isSuccess ? (
          <CheckCircle2 size={14} className="shrink-0 text-positive" />
        ) : (
          <XCircle size={14} className="shrink-0 text-negative" />
        )}
        <span className="text-left">{entry.summary}</span>
        {entry.usage?.durationMs != null && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/50">
            <Clock size={10} />
            {formatDuration(entry.usage.durationMs)}
          </span>
        )}
      </button>
      {isExpanded && entry.result && (
        <div className="ml-[7px] mt-0.5 border-l border-border/40 pl-3">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="flex items-start gap-2">
              {isSuccess ? (
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-positive" />
              ) : (
                <XCircle size={12} className="mt-0.5 shrink-0 text-negative" />
              )}
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-foreground/70">
                {entry.result}
              </pre>
            </div>
            {entry.usage?.toolUses != null && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <Zap size={10} />
                <span>{t('toolUsageCount', { count: entry.usage.toolUses })}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(TaskNotificationItem);
