import { useState, useCallback, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import TaskNode from '@/components/features/agent/task-node';
import type { ITask } from '@/types/mission';

interface ITaskTreeProps {
  tasks: ITask[];
  agentId: string;
  missionId: string;
  collapsible?: boolean;
}

const COLLAPSE_THRESHOLD = 20;
const EXIT_DURATION = 300;

interface IExitState {
  prevTasks: ITask[];
  mergedTasks: ITask[];
  exitingIds: Set<string>;
  pendingClearIds: Set<string>;
}

const EMPTY_SET = new Set<string>();

const useExitAnimation = (tasks: ITask[]) => {
  const [exitState, setExitState] = useState<IExitState>({
    prevTasks: tasks,
    mergedTasks: tasks,
    exitingIds: EMPTY_SET,
    pendingClearIds: EMPTY_SET,
  });

  if (tasks !== exitState.prevTasks) {
    const prevMap = new Map(exitState.prevTasks.map((t) => [t.id, t]));
    const currentIds = new Set(tasks.map((t) => t.id));
    const removedTasks: ITask[] = [];

    for (const [id, task] of prevMap) {
      if (!currentIds.has(id)) removedTasks.push(task);
    }

    if (removedTasks.length > 0) {
      const removedIds = new Set(removedTasks.map((t) => t.id));
      const prevOrder = [...prevMap.keys()];
      const merged: ITask[] = [];

      for (const id of prevOrder) {
        if (currentIds.has(id)) {
          merged.push(tasks.find((t) => t.id === id)!);
        } else if (removedIds.has(id)) {
          merged.push(prevMap.get(id)!);
        }
      }
      for (const t of tasks) {
        if (!merged.some((m) => m.id === t.id)) merged.push(t);
      }

      setExitState({
        prevTasks: tasks,
        mergedTasks: merged,
        exitingIds: removedIds,
        pendingClearIds: removedIds,
      });
    } else {
      setExitState({
        prevTasks: tasks,
        mergedTasks: tasks,
        exitingIds: EMPTY_SET,
        pendingClearIds: EMPTY_SET,
      });
    }
  }

  useEffect(() => {
    if (exitState.pendingClearIds.size === 0) return;

    const timer = setTimeout(() => {
      setExitState((prev) => ({
        ...prev,
        mergedTasks: prev.mergedTasks.filter((t) => !prev.exitingIds.has(t.id)),
        exitingIds: EMPTY_SET,
        pendingClearIds: EMPTY_SET,
      }));
    }, EXIT_DURATION);

    return () => clearTimeout(timer);
  }, [exitState.pendingClearIds]);

  return { mergedTasks: exitState.mergedTasks, exitingIds: exitState.exitingIds };
};

const TaskTree = ({ tasks, agentId, missionId, collapsible }: ITaskTreeProps) => {
  const { mergedTasks, exitingIds } = useExitAnimation(tasks);
  const completedTasks = mergedTasks.filter((t) => t.status === 'completed');
  const shouldCollapse = collapsible && completedTasks.length >= COLLAPSE_THRESHOLD;

  const [completedExpanded, setCompletedExpanded] = useState(false);

  const toggleCompleted = useCallback(() => {
    setCompletedExpanded((prev) => !prev);
  }, []);

  const exitClass = (id: string) =>
    exitingIds.has(id)
      ? 'opacity-0 transition-opacity duration-300'
      : 'opacity-100 transition-opacity duration-300';

  if (!shouldCollapse) {
    return (
      <div className="ml-2 mt-3" role="tree">
        {mergedTasks.map((task, idx) => (
          <div key={task.id} className={exitClass(task.id)}>
            <TaskNode
              task={task}
              agentId={agentId}
              missionId={missionId}
              isLast={idx === mergedTasks.length - 1}
            />
          </div>
        ))}
      </div>
    );
  }

  const activeTasks = mergedTasks.filter((t) => t.status !== 'completed');

  return (
    <div className="ml-2 mt-3" role="tree">
      {!completedExpanded && completedTasks.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={toggleCompleted}
        >
          <ChevronRight size={14} />
          완료된 Task ({completedTasks.length})
        </button>
      )}

      {completedExpanded && (
        <>
          <button
            type="button"
            className="flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={toggleCompleted}
          >
            <ChevronRight size={14} className="rotate-90 transition-transform" />
            완료된 Task ({completedTasks.length})
          </button>
          {completedTasks.map((task, idx) => (
            <div key={task.id} className={exitClass(task.id)}>
              <TaskNode
                task={task}
                agentId={agentId}
                missionId={missionId}
                isLast={idx === completedTasks.length - 1 && activeTasks.length === 0}
              />
            </div>
          ))}
        </>
      )}

      {activeTasks.map((task, idx) => (
        <div key={task.id} className={exitClass(task.id)}>
          <TaskNode
            task={task}
            agentId={agentId}
            missionId={missionId}
            isLast={idx === activeTasks.length - 1}
          />
        </div>
      ))}
    </div>
  );
};

export default TaskTree;
