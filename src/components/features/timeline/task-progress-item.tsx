import { memo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ITimelineTaskProgress } from '@/types/timeline';

interface ITaskProgressItemProps {
  entry: ITimelineTaskProgress;
}

const StatusIcon = ({ status }: { status: ITimelineTaskProgress['status'] }) => {
  if (status === 'completed') {
    return <CheckCircle2 size={12} className="text-positive" />;
  }
  if (status === 'in_progress') {
    return (
      <span className="flex h-3 w-3 items-center justify-center">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-claude-active" />
      </span>
    );
  }
  return (
    <span className="h-3 w-3 rounded-full border border-muted-foreground/40" />
  );
};

const TaskProgressItem = ({ entry }: ITaskProgressItemProps) => {
  const label =
    entry.action === 'create'
      ? entry.subject
      : `Task ${entry.taskId} \u2192 ${entry.status}`;

  return (
    <div className="flex items-center gap-1.5 py-1">
      <StatusIcon status={entry.status} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
};

export default memo(TaskProgressItem);
