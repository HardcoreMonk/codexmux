import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, ListChecks, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ITaskItem, TCliState, TTaskStatus } from '@/types/timeline';

interface ITaskChecklistProps {
  tasks: ITaskItem[];
  cliState: TCliState;
}

const StatusIcon = ({ status }: { status: TTaskStatus }) => {
  if (status === 'completed') {
    return <CheckCircle2 size={14} className="text-positive" />;
  }
  if (status === 'in_progress') {
    return (
      <span className="flex h-[14px] w-[14px] items-center justify-center">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-claude-active" />
      </span>
    );
  }
  return (
    <span className="h-[14px] w-[14px] rounded-full border border-muted-foreground/40" />
  );
};

const TaskChecklist = ({ tasks, cliState }: ITaskChecklistProps) => {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const allCompleted = tasks.length > 0 && completedCount === tasks.length;
  const hasInProgress = tasks.some((t) => t.status === 'in_progress');

  const [collapsed, setCollapsed] = useState(allCompleted);
  const [dismissed, setDismissed] = useState(false);
  const [prevTasks, setPrevTasks] = useState(tasks);

  if (tasks !== prevTasks) {
    const changed =
      tasks.length !== prevTasks.length ||
      tasks.some((t, i) => prevTasks[i]?.status !== t.status);
    if (changed && collapsed) {
      setCollapsed(false);
    }
    setPrevTasks(tasks);
  }

  useEffect(() => {
    if (!allCompleted || cliState !== 'idle') return;

    const timer = setTimeout(() => setCollapsed(true), 3000);
    return () => clearTimeout(timer);
  }, [allCompleted, cliState]);

  const currentSubject = collapsed
    ? (tasks.find((t) => t.status === 'in_progress')?.subject ??
      tasks.findLast((t) => t.status === 'pending')?.subject)
    : undefined;

  const borderColor = allCompleted
    ? 'border-positive'
    : hasInProgress
      ? 'border-claude-active'
      : 'border-muted-foreground/40';

  if (dismissed) return null;

  return (
    <div
      className={cn(
        'sticky top-0 z-10 mx-4 mb-2 border-l-2 bg-muted/80 px-4 py-2',
        'animate-in fade-in slide-in-from-top-1 duration-200',
        borderColor,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="task-list"
        >
          {allCompleted ? (
            <CheckCircle2 size={14} className="shrink-0 text-positive" />
          ) : (
            <ListChecks size={14} className="shrink-0 text-claude-active" />
          )}
          <span
            className="text-xs leading-none font-medium tabular-nums"
            aria-live="polite"
          >
            TASK {completedCount} / {tasks.length}
          </span>
          {collapsed && currentSubject && (
            <span className="ml-1 min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
              {currentSubject}
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-200',
              collapsed && '-rotate-90',
            )}
          />
        </button>
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center self-start rounded-sm text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          aria-label={tc('close')}
        >
          <X size={12} />
        </button>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="overflow-hidden">
          <div
            id="task-list"
            role="list"
            aria-label={t('taskProgress')}
            className="mt-1.5 max-h-[240px] overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {tasks.map((task) => (
              <div
                key={task.taskId}
                role="listitem"
                className="flex items-center gap-2 py-0.5"
              >
                <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center">
                  <StatusIcon status={task.status} />
                </span>
                <span
                  className={cn(
                    'min-w-0 truncate text-xs',
                    task.status === 'completed' &&
                      'text-muted-foreground line-through',
                    task.status === 'in_progress' &&
                      'font-medium text-foreground',
                    task.status === 'pending' && 'text-muted-foreground',
                  )}
                >
                  {task.subject}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskChecklist;
