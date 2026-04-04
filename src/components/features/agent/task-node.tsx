import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import StepNode from '@/components/features/agent/step-node';
import TabLink from '@/components/features/agent/tab-link';
import BlockedPopover from '@/components/features/agent/blocked-popover';
import type { ITask, TTaskStatus } from '@/types/mission';

interface ITaskNodeProps {
  task: ITask;
  agentId: string;
  missionId: string;
  isLast: boolean;
}

const statusIcon: Record<TTaskStatus, React.ReactNode> = {
  pending: (
    <span className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
  ),
  running: (
    <span className="flex h-3.5 w-3.5 items-center justify-center">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ui-teal" />
    </span>
  ),
  completed: <CheckCircle2 size={14} className="text-positive" />,
  blocked: <AlertCircle size={14} className="text-ui-amber" />,
  failed: <XCircle size={14} className="text-negative" />,
};

const statusText: Record<TTaskStatus, string> = {
  pending: 'text-muted-foreground',
  running: 'text-foreground font-medium',
  completed: 'text-muted-foreground',
  blocked: 'text-ui-amber font-medium',
  failed: 'text-negative',
};

const TaskNode = ({ task, agentId, missionId, isLast }: ITaskNodeProps) => {
  const isUnconfirmed = !task.confirmed;
  const icon = isUnconfirmed ? (
    <span className="inline-block h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground/40" />
  ) : (
    statusIcon[task.status]
  );

  const titleClass = isUnconfirmed
    ? 'text-muted-foreground/60'
    : statusText[task.status];

  const content = (
    <div
      className={cn(
        'relative',
        !isLast && 'pb-1',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 py-1.5',
          task.status === 'blocked' && 'cursor-pointer',
        )}
        role="treeitem"
        aria-selected={task.status === 'running'}
        aria-expanded={task.steps.length > 0}
      >
        <span className="relative z-10 flex-shrink-0 bg-background">{icon}</span>
        <span className={cn('text-sm', titleClass)}>
          {task.title}
          {isUnconfirmed && ' ┄┄┄'}
        </span>
        {task.status === 'running' && task.tabLink && <TabLink tabLink={task.tabLink} />}
      </div>

      {task.steps.length > 0 && (
        <div
          className={cn(
            'ml-[7px] border-l pl-4',
            isUnconfirmed
              ? 'border-dashed border-muted-foreground/15'
              : 'border-muted-foreground/15',
          )}
        >
          {task.steps.map((step) => (
            <StepNode key={step.id} title={step.title} status={step.status} />
          ))}
        </div>
      )}
    </div>
  );

  if (task.status === 'blocked') {
    return (
      <BlockedPopover agentId={agentId} missionId={missionId} taskId={task.id}>
        {content}
      </BlockedPopover>
    );
  }

  return content;
};

export default TaskNode;
