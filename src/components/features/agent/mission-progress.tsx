import { cn } from '@/lib/utils';
import type { ITask, TMissionStatus } from '@/types/mission';

interface IMissionProgressProps {
  tasks: ITask[];
  status: TMissionStatus;
}

const statusColor: Record<TMissionStatus, string> = {
  pending: 'bg-muted-foreground/40',
  running: 'bg-ui-teal',
  blocked: 'bg-ui-amber',
  completed: 'bg-positive',
  failed: 'bg-negative',
};

const MissionProgress = ({ tasks, status }: IMissionProgressProps) => {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const blockedCount = tasks.filter((t) => t.status === 'blocked').length;
  const percent = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <div
          className="h-1 flex-1 rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemax={total}
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500', statusColor[status])}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {completed}/{total}
        </span>
      </div>

      {blockedCount > 0 && (
        <span className="mt-1 inline-block text-xs text-ui-amber">
          🟠 {blockedCount} blocked
        </span>
      )}
    </div>
  );
};

export default MissionProgress;
